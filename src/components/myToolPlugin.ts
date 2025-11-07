import { reactive } from 'vue'
import { toolPlugin } from '../plugins'
import type { Message } from '../types'

export const myToolPlugin = (options: Pick<Parameters<typeof toolPlugin>[0], 'getTools' | 'callTool'>) => {
  const { getTools, callTool } = options

  let firstResponseMessage: Message | null = null

  return toolPlugin({
    toolCallCancelledContent: '{"error":"Tool call cancelled."}',
    toolCallFailedContent: '{"error":"Tool call failed."}',
    getTools,
    callTool,
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
        setRequestMessages(
          messages.slice(0, -1).concat(
            lastMessage.renderContent.map(({ content, originalContent, ...rest }) => ({
              ...rest,
              content: originalContent || content,
            })),
          ),
        )
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
    },
    onSSEChunk: (context) => {
      const { currentMessage } = context

      if (!currentMessage.type && currentMessage.role === 'assistant') {
        currentMessage.type = 'markdown'
      }
    },
    onToolCallStart: (toolCall, { currentMessage }) => {
      Object.assign(currentMessage, {
        type: 'tool',
        name: toolCall.function.name,
        content: JSON.stringify({ arguments: JSON.parse(toolCall.function.arguments) }),
        status: 'running',
        formatPretty: true,
        defaultOpen: true,
      })
    },
    onToolCallEnd: (_toolCall, { currentMessage, status }) => {
      currentMessage.status = status

      let content: Record<string, any> = {}
      try {
        content = JSON.parse(currentMessage.content)
      } catch {}

      if (status !== 'success') {
        if (status === 'failed') {
          content.error = 'Tool call failed.'
        } else if (status === 'cancelled') {
          content.error = 'Tool call cancelled.'
        }

        currentMessage.content = JSON.stringify(content)
      }

      const originalContent = content.error || content.result
      currentMessage.originalContent =
        typeof originalContent === 'string' ? originalContent : JSON.stringify(originalContent)
    },
    onTurnEnd: () => {
      if (firstResponseMessage) {
        firstResponseMessage.content = firstResponseMessage.renderContent!.slice(-1).pop()?.content ?? ''
        firstResponseMessage.flatRenderContent = undefined
      }
    },
  })
}
