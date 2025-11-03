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
  options: useMessagePlugin & {
    beforeCallTools?: (toolCalls: ToolCall[]) => Promise<void>
    callTool: (toolCall: ToolCall) => Promise<string>
    toolCallCancelledContent?: string
    toolCannFailedContent?: string
    toolCallFailedContent?: string
  },
): useMessagePlugin => {
  const {
    beforeCallTools,
    callTool,
    toolCallCancelledContent = 'Tool call cancelled',
    toolCannFailedContent = 'Tool call failed',
    ...restOptions
  } = options

  return {
    name: 'tool',
    ...restOptions,
    onAfterRequest: async (context) => {
      const { currentMessage, lastChoiceChunk, setRequestState } = context

      if (lastChoiceChunk?.finish_reason !== 'tool_calls' || !currentMessage.tool_calls?.length) {
        return null
      }

      setRequestState('processing', 'calling-tools')
      await beforeCallTools?.(currentMessage.tool_calls!)

      const toolCallPromises = currentMessage.tool_calls.map(async (toolCall) => {
        console.log(`Calling tool: ${toolCall.function.name}`)
        console.log(`Arguments:`, toolCall.function.arguments)

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
          toolMessage.content = toolCannFailedContent
        }
        toolMessage.metadata!.updatedAt = Math.floor(Date.now() / 1000)

        return toolMessage
      })

      return Promise.all(toolCallPromises)
    },
    onTurnEnd: (context) => {
      const { currentTurn, requestState, messages } = context
      if (requestState === 'aborted') {
        fillMissingToolMessages(currentTurn, messages, toolCallCancelledContent)
      }

      return restOptions.onTurnEnd?.(context)
    },
  }
}
