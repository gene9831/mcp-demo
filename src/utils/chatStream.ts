import { processSSEStream } from '../processSSEStream'
import type { MessageRequestBody, RequestBody, SSEStreamChunk } from '../types'

export const chatStream = async (
  requestBody: MessageRequestBody,
  options: { signal?: AbortSignal; onData?: (data: SSEStreamChunk) => void },
) => {
  const { signal, onData } = options

  const finalRequestBody: RequestBody = {
    ...requestBody,
    model: 'deepseek-chat',
    stream: true,
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
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

  return processSSEStream<SSEStreamChunk>(response, {
    signal,
    onData,
  })
}
