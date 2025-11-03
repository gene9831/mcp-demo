# MCP HTTP Tool - Math Addition Tool

This project implements a Model Context Protocol (MCP) tool with HTTP support that provides an addition function for AI systems to call via web interface.

## Features

- **Add Tool**: Takes two number parameters and returns their sum
- **HTTP Server**: Implements MCP Streamable HTTP protocol (2025-03-26)
- **Web Interface**: Modern web client for testing and using the tool
- **Session Management**: Full MCP session support with resumability
- **TypeScript Support**: Fully typed implementation

## Installation

```bash
# Install dependencies
pnpm install

# Install MCP SDK and HTTP dependencies
pnpm add @modelcontextprotocol/sdk express cors
pnpm add -D tsx @types/node @types/express @types/cors
```

## Usage

### Running the HTTP MCP Server

```bash
# Start the HTTP MCP server
pnpm run mcp:server
```

### Testing the Tool

```bash
# Run the test suite to verify functionality
pnpm run mcp:test
```

### Running the Web Interface

```bash
# Start the Vue development server
pnpm run dev
```

### Available Scripts

- `pnpm run mcp:server` - Start the HTTP MCP server
- `pnpm run mcp:test` - Run comprehensive tests
- `pnpm run dev` - Start Vue development server with web interface

## API Endpoints

### Health Check

- **GET** `/health` - Server status and information

### MCP Streamable HTTP

- **POST** `/mcp` - Initialize MCP session and call tools
- **GET** `/mcp` - Establish SSE stream for real-time communication
- **DELETE** `/mcp` - Terminate MCP session

### Direct HTTP API

- **POST** `/add` - Direct addition calculation (non-MCP)

## Tool Specification

### Add Tool

**Name**: `add`

**Description**: Add two numbers together

**Parameters**:

- `a` (number, required): First number to add
- `b` (number, required): Second number to add

**Returns**: Text content with the sum result

**Example**:

```json
{
  "name": "add",
  "arguments": {
    "a": 5,
    "b": 3
  }
}
```

**Response**:

```
The sum of 5 and 3 is 8
```

## Architecture

- `mcp-http-server.ts` - HTTP MCP server implementation
- `test-http-api.ts` - Test suite for HTTP API functionality
- `src/components/MCPWebClient.vue` - Vue component for web interface
- `package.json` - Scripts and dependencies

## Testing

The test suite includes:

- ✅ Positive numbers (5 + 3 = 8)
- ✅ Negative numbers (-10 + 7 = -3)
- ✅ Zero values (0 + 0 = 0)
- ✅ Decimal numbers (3.14 + 2.86 = 6.0)
- ✅ Mixed positive/negative (100 + -50 = 50)

All tests pass with 100% success rate.

## MCP Protocol

This implementation follows the MCP Streamable HTTP specification:

- Uses HTTP transport with SSE streaming
- Implements session management and resumability
- Supports both MCP protocol and direct HTTP API
- Provides proper error handling and validation
- Supports TypeScript type safety

## Web Interface

The web interface provides:

- Real-time server status monitoring
- Support for both MCP protocol and direct HTTP calls
- Calculation history tracking
- Modern, responsive UI design
- Error handling and validation

## Integration with AI Systems

This MCP tool can be integrated with AI systems that support:

- MCP Streamable HTTP protocol (2025-03-26)
- Direct HTTP API calls
- Web-based interfaces

The AI can call the `add` tool through either the full MCP protocol or simple HTTP requests.
