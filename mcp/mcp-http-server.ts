#!/usr/bin/env node

import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import pino from 'pino'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

// Configure logger with colors and timestamps
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
    },
  },
})

// Create Express app
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(
  cors({
    origin: '*', // Allow all origins - adjust as needed for production
    exposedHeaders: ['Mcp-Session-Id'],
  }),
)
app.use(express.json())

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {}

// Define the add tool
const ADD_TOOL = {
  name: 'add',
  description: 'Add two numbers together',
  inputSchema: {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: 'First number to add',
      },
      b: {
        type: 'number',
        description: 'Second number to add',
      },
    },
    required: ['a', 'b'],
  },
}

// Define the multiply tool
const MULTIPLY_TOOL = {
  name: 'multiply',
  description: 'Multiply two numbers together and return the result',
  inputSchema: {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: 'First number to multiply',
      },
      b: {
        type: 'number',
        description: 'Second number to multiply',
      },
    },
    required: ['a', 'b'],
  },
}

// Create MCP server instance
const createMCPServer = () => {
  const server = new Server(
    {
      name: 'math-tools-http-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    },
  )

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [ADD_TOOL, MULTIPLY_TOOL],
    }
  })

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (request.params.name === 'add') {
      const { a, b } = request.params.arguments as { a: number; b: number }

      // Validate input parameters
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both parameters must be numbers')
      }

      // Calculate the sum
      const result = a + b

      return {
        content: [
          {
            type: 'text',
            text: `${result}`,
          },
        ],
      }
    }

    if (request.params.name === 'multiply') {
      const { a, b } = request.params.arguments as { a: number; b: number }

      // Validate input parameters
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both parameters must be numbers')
      }

      // Calculate the product
      const result = a * b

      return {
        content: [
          {
            type: 'text',
            text: `${result}`,
          },
        ],
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`)
  })

  return server
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'MCP HTTP Server is running',
    protocol: 'MCP Streamable HTTP',
    version: '2025-03-26',
    endpoints: {
      mcp: '/mcp (GET/POST/DELETE)',
      health: '/health (GET)',
    },
  })
})

// Handle all MCP Streamable HTTP requests (GET, POST, DELETE) on a single endpoint
app.all('/mcp', async (req, res) => {
  logger.info(`Received ${req.method} request to /mcp`)

  try {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string
    let transport: StreamableHTTPServerTransport

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId]
    } else if (!sessionId && req.method === 'POST' && req.body?.method === 'initialize') {
      // Create new transport for initialization
      const eventStore = new InMemoryEventStore()
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore, // Enable resumability
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID when session is initialized
          logger.info({ sessionId }, 'MCP session initialized')
          transports[sessionId] = transport
        },
        onsessionclosed: (sessionId) => {
          // Clean up transport when session is closed
          logger.info({ sessionId }, 'MCP session closed')
          delete transports[sessionId]
        },
      })

      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid && transports[sid]) {
          logger.info({ sessionId: sid }, 'Transport closed, removing from transports map')
          delete transports[sid]
        }
      }

      // Connect the transport to the MCP server
      const server = createMCPServer()
      await server.connect(transport)
    } else {
      // Invalid request - no session ID or not initialization request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or invalid request method',
        },
        id: null,
      })
      return
    }

    // Handle the request with the transport
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    const err = error as Error
    logger.error({ error: err.message, stack: err.stack }, 'Error handling MCP request')
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      })
    }
  }
})

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Express error handler')
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: ['GET /health', 'ALL /mcp (MCP Streamable HTTP)'],
  })
})

// Start the server
app.listen(PORT, () => {
  logger.info(`🚀 MCP HTTP Server running on http://localhost:${PORT}`)
  logger.info(`📋 Available endpoints:`)
  logger.info(`   GET  /health     - Health check`)
  logger.info(`   ALL  /mcp        - MCP Streamable HTTP (GET/POST/DELETE)`)
  logger.info(`🌐 MCP Protocol Information:`)
  logger.info(`   Protocol: MCP Streamable HTTP`)
  logger.info(`   Version: 2025-03-26`)
  logger.info(`   Features: Session management, Resumability, SSE streaming`)
  logger.info(`🔗 Test URLs:`)
  logger.info(`   Health: http://localhost:${PORT}/health`)
  logger.info(`   MCP: http://localhost:${PORT}/mcp`)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down MCP HTTP Server...')
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      logger.info({ sessionId }, 'Closing transport for session')
      await transports[sessionId].close()
      delete transports[sessionId]
    } catch (error) {
      const err = error as Error
      logger.error({ sessionId, error: err.message }, 'Error closing transport for session')
    }
  }
  logger.info('Server shutdown complete')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down MCP HTTP Server...')
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      logger.info({ sessionId }, 'Closing transport for session')
      await transports[sessionId].close()
      delete transports[sessionId]
    } catch (error) {
      const err = error as Error
      logger.error({ sessionId, error: err.message }, 'Error closing transport for session')
    }
  }
  logger.info('Server shutdown complete')
  process.exit(0)
})
