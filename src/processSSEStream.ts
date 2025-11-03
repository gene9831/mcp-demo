// SSE Stream options
export interface SSEStreamOptions<T = any> {
  signal?: AbortSignal
  onData?: (data: T) => void
}

// Function to handle SSE stream parsing
export const processSSEStream = async <T = any>(
  response: Response,
  options: SSEStreamOptions<T> = {},
): Promise<'completed' | 'aborted'> => {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('ReadableStream not supported')
  }

  const { signal, onData } = options
  const decoder = new TextDecoder()
  let buffer = ''

  // Set up abort signal listener
  const abortHandler = () => {
    reader.cancel().catch((error) => {
      console.error('Error canceling reader:', error)
    })
  }

  signal?.addEventListener('abort', abortHandler)

  try {
    while (true) {
      if (signal?.aborted) {
        return 'aborted'
      }

      const { done, value } = await reader.read()

      if (done) {
        return signal?.aborted ? 'aborted' : 'completed'
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
            return 'completed'
          }

          try {
            const parsedData = JSON.parse(data) as T
            onData?.(parsedData)
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
