import { reactive } from 'vue'
import { toolPlugin } from '../plugins'
import type { BasePluginContext, Message, ToolCall } from '../types'
import { toAsyncGenerator } from '../utils'

function wrapCallToolWithErrorHandling(
  callTool: (
    toolCall: ToolCall,
    context: BasePluginContext & { currentMessage: Message },
  ) => Promise<string | Record<string, any>> | AsyncGenerator<string | Record<string, any>>,
) {
  return async function* (
    toolCall: ToolCall,
    context: BasePluginContext & { currentMessage: Message },
  ): AsyncGenerator<string | Record<string, any>, void, unknown> {
    const { currentMessage, abortSignal } = context

    try {
      const result = callTool(toolCall, context)

      // 将 Promise 或异步迭代器统一转换为异步生成器
      const iterator = toAsyncGenerator(result)

      for await (const chunk of iterator) {
        yield chunk
      }
      context.currentMessage.status = 'success'
    } catch (error) {
      if (abortSignal.aborted) {
        currentMessage.status = 'cancelled'
        yield { error: 'Tool call cancelled.' }
      } else {
        currentMessage.status = 'failed'
        yield { error: 'Tool call failed.' }
      }
      throw error
    }
  }
}

export const myToolPlugin = (options: Pick<Parameters<typeof toolPlugin>[0], 'getTools' | 'callTool'>) => {
  const { getTools, callTool } = options

  let firstResponseMessage: Message | null = null

  return toolPlugin({
    toolCallCancelledContent: '{"error":"Tool call cancelled."}',
    toolCallFailedContent: '{"error":"Tool call failed."}',
    getTools,
    callTool: wrapCallToolWithErrorHandling(callTool),
    onTurnStart: () => {
      firstResponseMessage = null
    },
    onBeforeRequest: (context) => {
      const { messages, setRequestMessages } = context

      const lastMessage = messages.slice(-1).pop()
      if (
        lastMessage &&
        lastMessage.role === 'assistant' &&
        lastMessage.flatRenderContent &&
        Array.isArray(lastMessage.renderContent)
      ) {
        setRequestMessages(messages.slice(0, -1).concat(lastMessage.renderContent))
      }
    },
    onMessageAppend: (context) => {
      const { currentMessage, messages, preventDefault } = context

      preventDefault()

      if (!firstResponseMessage) {
        firstResponseMessage = reactive({
          role: 'assistant',
          content: '',
          renderContent: [currentMessage],
          flatRenderContent: true,
        })
        messages.push(firstResponseMessage)
      } else {
        firstResponseMessage.renderContent!.push(currentMessage)
      }

      if (currentMessage.role === 'tool') {
        Object.assign(currentMessage, {
          type: 'tool',
          name: currentMessage.metadata?.function?.name || 'Tool',
          status: 'running',
          formatPretty: true,
          defaultOpen: true,
        })
      }
    },
    onTurnEnd: () => {
      if (firstResponseMessage) {
        firstResponseMessage.content = firstResponseMessage.renderContent!.slice(-1).pop()?.content ?? ''
        firstResponseMessage.flatRenderContent = undefined
      }
    },
  })
}
