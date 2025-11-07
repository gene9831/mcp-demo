import type { MessageRequestBody, RequestBody } from '../types'
import { createSSEStreamIterator } from './SSE'

export const createChatStreamIterator = async <T = any>(
  requestBody: MessageRequestBody,
  options: { signal?: AbortSignal } = {},
) => {
  const { signal } = options

  const finalRequestBody: RequestBody = {
    ...requestBody,
    model: 'qwen-plus',
    enable_thinking: true,
    stream: true,
  }

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_API_KEY}`,
    },
    body: JSON.stringify(finalRequestBody),
    signal,
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return createSSEStreamIterator<T>(response, { signal })
}
