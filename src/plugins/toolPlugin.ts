import type { Ref } from 'vue'
import type { Message, ToolCall, useMessagePlugin } from '../types'

/**
 * 补全缺失的工具消息（在工具调用被取消时）
 * 当请求被中止时，查找当前回合（currentTurn）中最后一条包含 tool_calls 的 assistant 消息，
 * 对其中每个 tool_call_id 检查其后是否存在对应的 tool 消息；若不存在，则追加一条“工具调用已取消”的 tool 消息。
 */
function fillMissingToolMessages(
  currentTurn: Message[],
  messages: Ref<Message[]>,
  toolCallCancelledContent: string,
): void {
  // 在 currentTurn 中查找最后一条 assistant 消息
  let lastAssistantMessageIndex = -1
  for (let i = currentTurn.length - 1; i >= 0; i--) {
    if (currentTurn[i].role === 'assistant') {
      lastAssistantMessageIndex = i
      break
    }
  }

  const lastAssistantMessage = currentTurn[lastAssistantMessageIndex]
  if (lastAssistantMessageIndex === -1 || !lastAssistantMessage.tool_calls?.length) {
    return
  }

  const toolCallIds = lastAssistantMessage.tool_calls.map((toolCall) => toolCall.id)
  // 找到没有对应 tool 消息的 tool_call_id 集合
  const missingToolCallIds = toolCallIds.filter(
    (toolCallId) =>
      !currentTurn
        .slice(lastAssistantMessageIndex + 1)
        .some((msg) => msg.role === 'tool' && msg.tool_call_id === toolCallId),
  )

  // 为缺失的 tool_call_id 追加“工具调用已取消”的 tool 消息
  if (missingToolCallIds.length > 0) {
    const missingToolMessages = missingToolCallIds.map((toolCallId) => ({
      role: 'tool',
      tool_call_id: toolCallId,
      content: toolCallCancelledContent,
    }))
    messages.value.push(...missingToolMessages)
  }
}

export const toolPlugin = (
  options: Omit<useMessagePlugin, 'onAfterRequest'> & {
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
     * 插件将自动补充“工具调用已取消”的 tool 消息。默认：true。
     */
    autoFillMissingToolMessages?: boolean
  },
): useMessagePlugin => {
  const {
    beforeCallTools,
    callTool,
    toolCallCancelledContent = 'Tool call cancelled.',
    toolCallFailedContent = 'Tool call failed.',
    autoFillMissingToolMessages = true,
    ...restOptions
  } = options

  return {
    name: 'tool',
    ...restOptions,
    onTurnStart: (context) => {
      const { currentTurn, messages } = context
      if (autoFillMissingToolMessages) {
        fillMissingToolMessages(currentTurn, messages, toolCallCancelledContent)
      }
      return restOptions.onTurnStart?.(context)
    },
    onAfterRequest: async (context) => {
      const { currentMessage, lastChoiceChunk, setRequestState, appendMessage } = context

      if (lastChoiceChunk?.finish_reason !== 'tool_calls' || !currentMessage.tool_calls?.length) {
        return
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
    },
  }
}
