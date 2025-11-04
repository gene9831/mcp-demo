import type { useMessagePlugin } from '../types'

export const lengthPlugin = (options: useMessagePlugin & { continueContent?: string } = {}): useMessagePlugin => {
  const { continueContent = 'Please continue with your previous answer.', ...restOptions } = options

  return {
    name: 'length',
    ...restOptions,
    onAfterRequest: async (context) => {
      const { lastChoiceChunk, appendAndRequest } = context

      if (lastChoiceChunk?.finish_reason !== 'length') {
        return
      }

      // 输出长度达到了模型上下文长度限制，或达到了 max_tokens 的限制。自动加上 user 消息
      // 使用appendMessage api，按照插件顺序追加消息，并自动触发下一次请求
      appendAndRequest({ role: 'user', content: continueContent })

      return restOptions.onAfterRequest?.(context)
    },
  }
}
