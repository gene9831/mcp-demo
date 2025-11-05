import type { Ref } from 'vue'
import type { Message, ToolCall, useMessagePlugin } from '../types'

/**
 * 补全缺失的工具消息（在工具调用被取消时）
 * 遍历所有 messages，找到所有 role 为 assistant 并且 tool_calls 数组不为空的 message。
 * 对每条这样的消息，检查其后是否存在对应的 tool 消息（通过 tool_call_id 匹配）。
 * 如果某个 tool_call_id 没有对应的 tool 消息，则在该 assistant 消息之后插入一条"工具调用已取消"的 tool 消息。
 * 插入操作从后往前执行，确保不影响已记录的索引位置。
 */
function fillMissingToolMessages(messages: Ref<Message[]>, toolCallCancelledContent: string): void {
  // 第一阶段：从首位开始遍历，收集需要插入的信息
  interface InsertInfo {
    // 在哪个 assistant 消息之后插入（索引位置）
    insertAfterIndex: number
    // 需要插入的 tool_call_id 列表（保持原始顺序）
    missingToolCallIds: string[]
  }
  const insertInfos: InsertInfo[] = []

  // 从首位开始遍历 messages
  for (let i = 0; i < messages.value.length; i++) {
    const msg = messages.value[i]

    // 找到 role 为 assistant 并且 tool_calls 数组不为空的 message
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // 获取 tool_calls 数组中的 tool_call_id 集合
      const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id))

      // 在这条 message 之后查找对应的 tool 消息，记录已找到的 tool_call_id
      const foundToolCallIds = new Set<string>()

      // 从当前 assistant 消息之后的位置开始遍历
      for (let j = i + 1; j < messages.value.length; j++) {
        const toolMsg = messages.value[j]
        // 检查是否是 tool 消息，并且 tool_call_id 在当前 assistant 消息的 tool_call_id 集合中
        if (toolMsg.role === 'tool' && toolMsg.tool_call_id && toolCallIds.has(toolMsg.tool_call_id)) {
          foundToolCallIds.add(toolMsg.tool_call_id)
        }
      }

      // 找出缺失的 tool_call_id，并按照 tool_calls 数组中的顺序保留
      const missingToolCallIds = msg.tool_calls.map((tc) => tc.id).filter((id) => !foundToolCallIds.has(id))

      // 如果存在缺失的 tool_call_id，记录插入信息
      if (missingToolCallIds.length > 0) {
        insertInfos.push({
          insertAfterIndex: i,
          missingToolCallIds,
        })
      }
    }
  }

  // 第二阶段：从后往前插入，这样不会影响已记录的索
  for (let i = insertInfos.length - 1; i >= 0; i--) {
    const { insertAfterIndex, missingToolCallIds } = insertInfos[i]
    const cancelledMessages: Message[] = missingToolCallIds.map((toolCallId) => ({
      role: 'tool',
      tool_call_id: toolCallId,
      content: toolCallCancelledContent,
    }))

    // 在 assistant 消息之后插入所有取消消息
    messages.value.splice(insertAfterIndex + 1, 0, ...cancelledMessages)
  }
}

/**
 * 消息排除模式：从 messages 数组中直接移除消息。
 * 使用此模式时，消息会被完全从数组中移除，不会保留在 messages 中。
 */
export const EXCLUDE_MODE_REMOVE = 'remove' as const

/**
 * 处理需要排除的工具消息
 * 根据 excludeToolMessages 的模式，移除或标记包含 tool_calls 的 assistant 消息和对应的 tool 消息
 */
function processExcludedToolMessages(
  messages: Ref<Message[]>,
  excludeToolMessages: boolean | typeof EXCLUDE_MODE_REMOVE,
): void {
  const doNotSendAssistantMessages = messages.value.filter((msg) => msg.__do_not_send_next_turn__)
  const doNotSendToolMessageIds = new Set(
    doNotSendAssistantMessages.flatMap((msg) => msg.tool_calls?.map((toolCall) => toolCall.id) ?? []),
  )

  if (excludeToolMessages === EXCLUDE_MODE_REMOVE) {
    // 如果是 'remove' 模式，直接从 messages 中移除
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (
        msg.__do_not_send_next_turn__ ||
        msg.__do_not_send__ ||
        (msg.tool_call_id && doNotSendToolMessageIds.has(msg.tool_call_id))
      ) {
        messages.value.splice(i, 1)
      }
    }
  } else if (excludeToolMessages === true) {
    // 如果是 true，标记为不发送
    messages.value.forEach((msg) => {
      if (msg.__do_not_send_next_turn__ || (msg.tool_call_id && doNotSendToolMessageIds.has(msg.tool_call_id))) {
        msg.__do_not_send__ = true
        delete msg.__do_not_send_next_turn__
      }
    })
  }
}

export const toolPlugin = (
  options: useMessagePlugin & {
    /**
     * 在处理包含 tool_calls 的响应前调用。
     */
    beforeCallTools?: (toolCalls: ToolCall[]) => Promise<void>
    /**
     * 执行单个工具调用并返回其文本结果的函数。
     */
    callTool: (toolCall: ToolCall) => Promise<string>
    /**
     * 当请求被中止时用于工具调用取消的消息内容。
     */
    toolCallCancelledContent?: string
    /**
     * 当工具调用执行失败（抛错或拒绝）时使用的消息内容。
     */
    toolCallFailedContent?: string
    /**
     * 是否在请求被中止时自动补充缺失的 tool 消息。
     * 当 assistant 响应了 tool_calls 但未追加对应的 tool 消息时，
     * 插件将自动补充"工具调用已取消"的 tool 消息。默认：true。
     */
    autoFillMissingToolMessages?: boolean
    /**
     * 是否在下一轮对话中，排除包含 tool_calls 的 assistant 消息和对应的 tool 消息，只保留结果。
     * - 当为 `true` 时，这些消息会被标记为不发送，不会包含在下一次请求的 messages 中。
     * - 当为 `'remove'` 时，这些消息会直接从 messages 数组中移除。
     * 默认：false。
     */
    excludeToolMessagesNextTurn?: boolean | typeof EXCLUDE_MODE_REMOVE
  },
): useMessagePlugin => {
  const {
    beforeCallTools,
    callTool,
    toolCallCancelledContent = 'Tool call cancelled.',
    toolCallFailedContent = 'Tool call failed.',
    autoFillMissingToolMessages = true,
    excludeToolMessagesNextTurn = false,
    ...restOptions
  } = options

  return {
    name: 'tool',
    ...restOptions,
    onTurnStart: (context) => {
      const { messages } = context

      if (autoFillMissingToolMessages) {
        fillMissingToolMessages(messages, toolCallCancelledContent)
      }

      if (excludeToolMessagesNextTurn) {
        processExcludedToolMessages(messages, excludeToolMessagesNextTurn)
      }

      return restOptions.onTurnStart?.(context)
    },
    onBeforeRequest: (context) => {
      const { requestBody, messages, sanitizeMessages } = context
      // 只有当值为 true 时才过滤（为'remove'时消息已被移除）
      if (excludeToolMessagesNextTurn === true) {
        requestBody.messages = sanitizeMessages(messages.value.filter((msg) => !msg.__do_not_send__))
      }

      return restOptions.onBeforeRequest?.(context)
    },
    onAfterRequest: async (context) => {
      const { currentMessage, lastChoiceChunk, setRequestState, appendMessage } = context

      if (lastChoiceChunk?.finish_reason !== 'tool_calls' || !currentMessage.tool_calls?.length) {
        return
      }

      if (excludeToolMessagesNextTurn) {
        // 标记主消息，主消息下的tool_calls中的tool_call_id对应的tool消息下一轮也不发送
        currentMessage.__do_not_send_next_turn__ = true
      }

      setRequestState('processing', 'calling-tools')
      await beforeCallTools?.(currentMessage.tool_calls!)

      const toolCallPromises = currentMessage.tool_calls.map(async (toolCall) => {
        const now = Math.floor(Date.now() / 1000)
        const toolMessage: Message = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: '',
          metadata: {
            createdAt: now,
            updatedAt: now,
          },
        }

        try {
          toolMessage.content = await callTool(toolCall)
        } catch (error) {
          toolMessage.content = toolCallFailedContent
        }
        toolMessage.metadata!.updatedAt = Math.floor(Date.now() / 1000)

        return toolMessage
      })

      const toolMessages = await Promise.all(toolCallPromises)
      // 使用appendMessage api，按照插件顺序追加消息，并自动触发下一次请求
      appendMessage(toolMessages, { request: true })

      return restOptions.onAfterRequest?.(context)
    },
  }
}
