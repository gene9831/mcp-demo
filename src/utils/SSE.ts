// 创建 AbortError 的辅助函数
function createAbortError(message = 'The operation was aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

// Async generator function that yields SSE data
export async function* createSSEStreamIterator<T = any>(
  response: Response,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<T, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('ReadableStream not supported')
  }

  const { signal } = options
  const decoder = new TextDecoder()
  let buffer = ''

  // Set up abort signal listener
  const abortHandler = () => {
    reader.cancel()
  }

  signal?.addEventListener('abort', abortHandler)

  try {
    while (true) {
      if (signal?.aborted) {
        throw createAbortError()
      }

      let readResult
      try {
        readResult = await reader.read()
      } catch (readError) {
        // If read fails due to abort, throw AbortError
        if (signal?.aborted) {
          throw createAbortError()
        }
        throw readError
      }

      const { done, value } = readResult

      if (done) {
        if (signal?.aborted) {
          throw createAbortError()
        }
        return
      }

      // Decode the chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk

      // Process complete SSE events
      const lines = buffer.split('\n')

      buffer = lines.pop() || '' // Keep incomplete line in buffer

      // Process each complete line
      for (const line of lines) {
        // Skip empty lines (SSE event separators)
        if (line.trim() === '') {
          continue
        }

        // Only process data lines
        if (line.startsWith('data: ')) {
          const data = line.slice(6) // Remove 'data: ' prefix

          if (data === '[DONE]') {
            return
          }

          try {
            const parsedData = JSON.parse(data) as T
            // Yield the parsed data instead of calling callback
            yield parsedData
          } catch (parseError) {
            // Log error but continue processing other events
            console.warn('Failed to parse SSE data:', data, parseError)
          }
        }
      }
    }
  } finally {
    // Clean up abort listener
    signal?.removeEventListener('abort', abortHandler)
    reader.releaseLock()
  }
}
