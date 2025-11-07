import { reactive } from 'vue'
import type { BasePluginContext, Message, Tool, ToolCall, useMessagePlugin } from '../types'
import { toAsyncGenerator } from '../utils'
import { combileDeltaData } from '../utils/deltaDataMerger'

/**
 * 补全缺失的工具消息（在工具调用被取消时）
 * 遍历所有 messages，找到所有 role 为 assistant 并且 tool_calls 数组不为空的 message。
 * 对每条这样的消息，检查其后是否存在对应的 tool 消息（通过 tool_call_id 匹配）。
 * 如果某个 tool_call_id 没有对应的 tool 消息，则在该 assistant 消息之后插入一条"工具调用已取消"的 tool 消息。
 * 插入操作从后往前执行，确保不影响已记录的索引位置。
 */
function fillMissingToolMessages(
  messages: Message[],
  cancelledContent: string,
  extraFields?: Record<string, any>,
): void {
  // 第一阶段：从首位开始遍历，收集需要插入的信息
  interface InsertInfo {
    // 在哪个 assistant 消息之后插入（索引位置）
    insertAfterIndex: number
    // 需要插入的 tool_call_id 列表（保持原始顺序）
    missingToolCallIds: string[]
  }
  const insertInfos: InsertInfo[] = []

  // 从首位开始遍历 messages
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // 找到 role 为 assistant 并且 tool_calls 数组不为空的 message
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // 获取 tool_calls 数组中的 tool_call_id 集合
      const toolCallIds = new Set(msg.tool_calls.map((tc) => tc.id))

      // 在这条 message 之后查找对应的 tool 消息，记录已找到的 tool_call_id
      const foundToolCallIds = new Set<string>()

      // 从当前 assistant 消息之后的位置开始遍历
      for (let j = i + 1; j < messages.length; j++) {
        const toolMsg = messages[j]
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
      content: cancelledContent,
      ...extraFields,
    }))

    // 在 assistant 消息之后插入所有取消消息
    messages.splice(insertAfterIndex + 1, 0, ...cancelledMessages)
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
  messages: Message[],
  excludeToolMessages: boolean | typeof EXCLUDE_MODE_REMOVE,
  doNotSendNextTurnSymbol: symbol,
  doNotSendSymbol: symbol,
): void {
  const doNotSendAssistantMessages = messages.filter((msg) => msg[doNotSendNextTurnSymbol])
  const doNotSendToolMessageIds = new Set(
    doNotSendAssistantMessages.flatMap((msg) => msg.tool_calls?.map((toolCall) => toolCall.id) ?? []),
  )

  if (excludeToolMessages === EXCLUDE_MODE_REMOVE) {
    // 如果是 'remove' 模式，直接从 messages 中移除
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (
        msg[doNotSendNextTurnSymbol] ||
        msg[doNotSendSymbol] ||
        (msg.tool_call_id && doNotSendToolMessageIds.has(msg.tool_call_id))
      ) {
        messages.splice(i, 1)
      }
    }
  } else if (excludeToolMessages === true) {
    // 如果是 true，标记为不发送
    for (const msg of messages) {
      if (msg[doNotSendNextTurnSymbol] || (msg.tool_call_id && doNotSendToolMessageIds.has(msg.tool_call_id))) {
        msg[doNotSendSymbol] = true
        delete msg[doNotSendNextTurnSymbol]
      }
    }
  }
}

export const toolPlugin = (
  options: useMessagePlugin & {
    /**
     * 获取工具列表的函数。
     */
    getTools: () => Promise<Tool[]>
    /**
     * 在处理包含 tool_calls 的响应前调用。
     */
    beforeCallTools?: (toolCalls: ToolCall[], context: BasePluginContext & { currentMessage: Message }) => Promise<void>
    /**
     * 执行单个工具调用并返回其文本结果的函数。
     */
    callTool: (
      toolCall: ToolCall,
      context: BasePluginContext & { currentMessage: Message },
    ) => Promise<string | Record<string, any>> | AsyncGenerator<string | Record<string, any>>
    /**
     * 工具调用开始时的回调函数。
     * 触发时机：工具消息已创建并追加后，调用 callTool 之前触发。
     * @param toolCall - 工具调用对象
     * @param context - 插件上下文，包含当前工具消息
     */
    onToolCallStart?: (toolCall: ToolCall, context: BasePluginContext & { currentMessage: Message }) => void
    /**
     * 工具调用结束时的回调函数。
     * 触发时机：工具调用完成（成功、失败或取消）时触发。
     * @param toolCall - 工具调用对象
     * @param context - 插件上下文，包含当前工具消息、状态和错误信息
     * @param context.status - 工具调用状态：'success' | 'failed' | 'cancelled'
     * @param context.error - 当状态为 'failed' 或 'cancelled' 时，可能包含错误信息
     */
    onToolCallEnd?: (
      toolCall: ToolCall,
      context: BasePluginContext & {
        currentMessage: Message
        status: 'success' | 'failed' | 'cancelled'
        error?: Error
      },
    ) => void
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
     * 插件将自动补充"工具调用已取消"的 tool 消息。默认：false。
     */
    autoFillMissingToolMessages?: boolean
    /**
     * 为自动补充的缺失工具消息添加的额外字段。
     * 这些字段会被合并到创建的 tool 消息对象中。
     */
    missingToolMessageFields?: Record<string, any>
    /**
     * 是否在下一轮对话中，排除包含 tool_calls 的 assistant 消息和对应的 tool 消息，只保留结果。
     * - 当为 `true` 时，这些消息会被标记为不发送，不会包含在下一次请求的 messages 中。
     * - 当为 `'remove'` 时，这些消息会直接从 messages 数组中移除。
     * 默认：false。
     */
    excludeToolMessagesNextTurn?: boolean | typeof EXCLUDE_MODE_REMOVE
    /**
     * 工具消息内容块处理钩子，在接收到每个数据块时触发。
     * 触发时机：工具调用返回流式数据时，每个chunk会触发此钩子。
     * 默认行为：如果没有任何插件调用 preventDefault，将使用默认逻辑更新 currentMessage.content：
     * - 如果chunk是字符串，直接拼接到现有content
     * - 如果chunk是对象，会解析现有content为JSON，合并数据，然后序列化
     * 自定义行为：如果插件调用了 preventDefault，则阻止默认更新逻辑，插件需要自行更新 currentMessage.content。
     *
     * @param context.chunk - 新的数据块，可能是字符串或对象
     * @param context.currentMessage - 当前工具消息对象，可直接修改其content属性
     * @param context.preventDefault - 阻止默认更新逻辑，插件需自行更新 currentMessage.content
     */
    onToolMessageChunk?: (
      context: BasePluginContext & {
        chunk: string | Record<string, any>
        currentMessage: Message
        preventDefault: () => void
      },
    ) => void
  },
): useMessagePlugin => {
  const {
    getTools,
    beforeCallTools,
    callTool,
    onToolCallStart,
    onToolCallEnd,
    toolCallCancelledContent = 'Tool call cancelled.',
    toolCallFailedContent = 'Tool call failed.',
    autoFillMissingToolMessages = false,
    missingToolMessageFields,
    excludeToolMessagesNextTurn = false,
    onToolMessageChunk,
    ...restOptions
  } = options

  const DO_NOT_SEND_NEXT_TURN = Symbol('doNotSendNextTurn')
  const DO_NOT_SEND = Symbol('doNotSend')

  return {
    name: 'tool',
    ...restOptions,
    onTurnStart: (context) => {
      const { messages } = context

      if (autoFillMissingToolMessages) {
        fillMissingToolMessages(messages, toolCallCancelledContent, missingToolMessageFields)
      }

      if (excludeToolMessagesNextTurn) {
        processExcludedToolMessages(messages, excludeToolMessagesNextTurn, DO_NOT_SEND_NEXT_TURN, DO_NOT_SEND)
      }

      return restOptions.onTurnStart?.(context)
    },
    onBeforeRequest: async (context) => {
      const { messages, requestBody, setRequestMessages } = context

      // 只有当值为 true 时才过滤（为'remove'时消息已被移除）
      if (excludeToolMessagesNextTurn === true) {
        setRequestMessages(messages.filter((msg) => !msg[DO_NOT_SEND]))
      }

      const tools = await getTools?.()
      if (tools && tools.length > 0) {
        requestBody.tools = tools
      }

      return restOptions.onBeforeRequest?.(context)
    },
    onAfterRequest: async (context) => {
      const { currentMessage, lastChoiceChunk, appendMessage, abortSignal, setRequestState } = context

      if (lastChoiceChunk?.finish_reason !== 'tool_calls' || !currentMessage.tool_calls?.length) {
        return
      }

      if (excludeToolMessagesNextTurn) {
        // 标记主消息，主消息下的tool_calls中的tool_call_id对应的tool消息下一轮也不发送
        currentMessage[DO_NOT_SEND_NEXT_TURN] = true
      }

      setRequestState('processing', 'calling-tools')
      await beforeCallTools?.(currentMessage.tool_calls, { ...context, currentMessage })

      const toolCallPromises = currentMessage.tool_calls.map(async (toolCall) => {
        const now = Math.floor(Date.now() / 1000)
        const toolMessage: Message = reactive({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: '',
          metadata: {
            createdAt: now,
            updatedAt: now,
          },
        })

        appendMessage(toolMessage, { request: true })

        const contextWithToolMessage = { ...context, currentMessage: toolMessage }

        onToolCallStart?.(toolCall, contextWithToolMessage)
        try {
          const result = callTool(toolCall, contextWithToolMessage)

          // 将 Promise 或异步迭代器统一转换为异步生成器
          const iterator = toAsyncGenerator(result)

          // 迭代并逐步拼接内容到 content
          for await (const chunk of iterator) {
            let shouldPreventDefault = false
            const preventDefault = () => {
              shouldPreventDefault = true
            }

            // 如果提供了 onToolMessageChunk 钩子，则调用
            onToolMessageChunk?.({ ...contextWithToolMessage, chunk, preventDefault })

            // 如果未调用 preventDefault，则使用默认逻辑
            if (!shouldPreventDefault) {
              // 默认逻辑：字符串拼接或 JSON 合并
              if (typeof chunk === 'string') {
                toolMessage.content += chunk
              } else {
                let parsedContent: Record<string, any> = {}
                try {
                  parsedContent = JSON.parse(toolMessage.content || '{}')
                } catch (error) {
                  console.warn(error)
                }
                toolMessage.content = JSON.stringify(combileDeltaData(parsedContent, chunk))
              }
            }

            toolMessage.metadata!.updatedAt = Math.floor(Date.now() / 1000)
          }

          onToolCallEnd?.(toolCall, { ...contextWithToolMessage, status: 'success' })
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))

          // 如果被 abort ，则抛出错误，主流程会处理状态
          // 也可以不抛出错误，直接返回，主流程会自动处理 abort 场景
          if (abortSignal.aborted) {
            onToolCallEnd?.(toolCall, { ...contextWithToolMessage, status: 'cancelled', error: err })
            // throw error
            return
          }

          // 其他错误视为工具调用失败，则将工具消息内容设置为失败内容
          console.error(error)

          if (toolMessage.content.length === 0) {
            toolMessage.content = toolCallFailedContent
          }

          onToolCallEnd?.(toolCall, { ...contextWithToolMessage, status: 'failed', error: err })
        }
      })

      await Promise.all(toolCallPromises)

      return restOptions.onAfterRequest?.(context)
    },
  }
}
