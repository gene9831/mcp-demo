import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// MCP Client options interface
interface McpClientOptions {
  baseUrl?: string
}

// MCP Client composable for Vue components
export function useMcpClient(options: McpClientOptions = {}) {
  const { baseUrl = 'http://localhost:3001' } = options
  // MCP client instances
  let client: Client | null = null
  let transport: StreamableHTTPClientTransport | null = null

  // Reactive state
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const errorMessage = ref<string | null>(null)

  // Computed properties
  const isConnected = computed(() => status.value === 'connected')
  const isConnecting = computed(() => status.value === 'connecting')

  // Methods
  const connect = async (): Promise<void> => {
    if (status.value === 'connected' || status.value === 'connecting') {
      return
    }

    status.value = 'connecting'
    errorMessage.value = null

    try {
      // Create MCP client
      client = new Client({
        name: 'mcp-web-client',
        version: '1.0.0',
      })

      // Create StreamableHTTP transport
      transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`))

      // Connect to server
      await client.connect(transport)
      status.value = 'connected'

      console.log('✅ MCP client connected successfully')
    } catch (err: any) {
      console.error('❌ Failed to connect MCP client:', err)
      errorMessage.value = err.message || 'Failed to connect to MCP server'
      status.value = 'error'
      throw err
    }
  }

  const disconnect = async (): Promise<void> => {
    try {
      if (transport) {
        await transport.close()
        transport = null
      }
      client = null
      status.value = 'disconnected'
      errorMessage.value = null
      console.log('🔌 MCP client disconnected')
    } catch (err: any) {
      console.error('❌ Error disconnecting MCP client:', err)
      errorMessage.value = err.message || 'Failed to disconnect from MCP server'
      status.value = 'error'
    }
  }

  const callTool = async (name: string, args: Record<string, any>): Promise<any> => {
    if (!client || status.value !== 'connected') {
      throw new Error('MCP client is not connected')
    }

    try {
      const result = await client.callTool({
        name,
        arguments: args,
      })

      return result
    } catch (err: any) {
      console.error('❌ Error calling tool:', err)
      errorMessage.value = err.message || `Failed to call tool: ${name}`
      status.value = 'error'
      throw err
    }
  }

  const listTools = async (): Promise<any[]> => {
    if (!client || status.value !== 'connected') {
      throw new Error('MCP client is not connected')
    }

    try {
      const tools = await client.listTools()
      return tools.tools || []
    } catch (err: any) {
      console.error('❌ Error listing tools:', err)
      errorMessage.value = err.message || 'Failed to list tools'
      status.value = 'error'
      throw err
    }
  }

  onMounted(() => {
    // connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    // State
    status,
    errorMessage: computed(() => errorMessage.value),
    isConnected,
    isConnecting,

    // Methods
    connect,
    disconnect,
    callTool,
    listTools,
  }
}
