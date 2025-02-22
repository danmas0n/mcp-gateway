# MCP Gateway

A TypeScript implementation of a Model Context Protocol (MCP) gateway that manages multiple MCP servers and provides a unified interface for tools.

## Features

- Manages multiple MCP servers through a single gateway
- Supports both SSE and STDIO transports
- Configurable through JSON configuration
- Improved process management using spawn-rx
- TypeScript implementation for better type safety

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the example configuration:
   ```bash
   cp config.json.example config.json
   ```
4. Edit `config.json` to configure your MCP servers
5. Build the project:
   ```bash
   npm run build
   ```
6. Start the gateway:
   ```bash
   npm start
   ```

## Configuration

The gateway is configured through `config.json`. Each MCP server needs:
- `command`: The command to run the server
- `args`: Array of command arguments
- `env`: (Optional) Environment variables for the server

Example configuration:
```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          "/path/to/allowed/directory"
        ]
      }
    }
  }
}
```

## Development

- `npm run build`: Build the TypeScript code
- `npm start`: Start the gateway
- `npm run dev`: Run TypeScript in watch mode
- `npm run dev:watch`: Run both TypeScript watch and nodemon

## License

ISC
