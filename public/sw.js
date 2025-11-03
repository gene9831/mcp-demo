// Service Worker to intercept POST /chat/completion requests
// and return streaming response with message chunks

const generateRandomId = () => {
  // Use native crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback to manual UUID v4 generation using crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)

    // Set version (4) and variant bits
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80

    // Convert to UUID string format
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-')
  }

  // Final fallback to Math.random (less secure)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

self.addEventListener('fetch', (event) => {
  // Only handle POST requests to /chat/completion
  if (event.request.method === 'POST' && event.request.url.includes('/chat/completion')) {
    event.respondWith(handleChatCompletion(event.request))
  }
})

async function handleChatCompletion(request) {
  try {
    // Parse the request body using RequestBody format
    const requestData = await request.json()
    console.log('Service Worker: Received request:', requestData)

    // Extract message content from the messages array
    const messages = requestData.messages || []
    const lastMessage = messages[messages.length - 1]
    const lastMessageContent = lastMessage ? lastMessage.content : ''
    const model = requestData.model || 'unknown'

    const id = generateRandomId()
    const created = Math.floor(Date.now() / 1000)
    const encoder = new TextEncoder()

    // Create a ReadableStream for streaming response
    const responseStream = new ReadableStream({
      start(controller) {
        // Split message into individual characters for streaming
        const chars = lastMessageContent.split('')
        let index = 0

        // Function to send next chunk
        const sendChunk = () => {
          if (index <= chars.length) {
            const content = chars.at(index) || ''
            const chunkData = {
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              system_fingerprint: null,
              choices: [
                {
                  index: 0,
                  delta: {
                    role: index === 0 ? 'assistant' : undefined,
                    content,
                  },
                  logprobs: null,
                  finish_reason: index === chars.length ? 'stop' : null,
                },
              ],
            }

            // Encode chunk as JSON and send
            const chunkString = 'data: ' + JSON.stringify(chunkData) + '\n\n'
            controller.enqueue(encoder.encode(chunkString))

            index++

            // Send next chunk after a small delay to simulate streaming
            setTimeout(sendChunk, 50)
          } else {
            const completionString = 'data: [DONE]' + '\n\n'
            controller.enqueue(encoder.encode(completionString))

            controller.close()
          }
        }

        // Start streaming
        sendChunk()
      },
    })

    // Return streaming response
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Service Worker: Error handling chat completion:', error)

    // Return error response
    return new Response(
      JSON.stringify({
        error: 'Failed to process request',
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
}

// Handle CORS preflight requests
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'OPTIONS' && event.request.url.includes('/chat/completion')) {
    event.respondWith(
      new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }),
    )
  }
})
