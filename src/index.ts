#!/usr/bin/env node

import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ServerManager } from "./serverManager.js";
import { Config, JsonRpcResponse } from "./types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import mcpProxy from "./mcpProxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "config.json");

const app = express();
app.use(cors());

const serverManager = new ServerManager();
let webAppTransports: SSEServerTransport[] = [];

async function loadConfig(): Promise<Config> {
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    return JSON.parse(configContent);
  } catch (error) {
    console.error("Error loading config:", error);
    throw error;
  }
}

app.get("/sse", async (req, res) => {
  try {
    console.log("New SSE connection");
    const serverName = req.query.server as string;
    
    if (!serverName) {
      res.status(400).json({ error: "Server name is required" });
      return;
    }

    const config = await loadConfig();
    const serverConfig = config.mcp.servers[serverName];
    
    if (!serverConfig) {
      res.status(404).json({ error: `Server ${serverName} not found in config` });
      return;
    }

    let server = serverManager.getServer(serverName);
    if (!server) {
      server = await serverManager.startServer(serverName, serverConfig);
    }

    const webAppTransport = new SSEServerTransport("/message", res);
    webAppTransports.push(webAppTransport);
    await webAppTransport.start();

    if (server.transport) {
      mcpProxy({
        transportToClient: webAppTransport,
        transportToServer: server.transport
      });
    }

    console.log(`Set up MCP proxy for ${serverName}`);
  } catch (error) {
    console.error("Error in /sse route:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.post("/message", express.json(), async (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    console.log(`Received message for sessionId ${sessionId}`, req.body);

    // If no sessionId, this might be an initial request before SSE connection
    if (!sessionId) {
      const message = req.body;
      if (message.method === "tools/call") {
        const { name, arguments: args } = message.params;
        
        // First, get all tools to find which server owns this tool
        const allTools = [];
        const servers = serverManager.getAllServers();
        
        for (const server of servers) {
          if (server.transport) {
            try {
              const response = await server.transport.send({
                jsonrpc: "2.0",
                method: "tools/list",
                params: {},
                id: message.id || 0
              });
              
              if (response.result?.tools) {
                allTools.push(...response.result.tools.map(tool => ({
                  ...tool,
                  server: server.name,
                  serverTransport: server.transport
                })));
              }
            } catch (error) {
              console.error(`Error getting tools from ${server.name}:`, error);
            }
          }
        }

        // Find the tool and its server
        const tool = allTools.find(t => t.name === name);
        if (!tool || !tool.serverTransport) {
          res.status(404).json({ error: `Tool ${name} not found` });
          return;
        }

        try {
          const response = await tool.serverTransport.send({
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name, arguments: args },
            id: message.id || 0
          });
          
          if (response.result) {
            res.json(response.result);
          } else if (response.error) {
            res.status(500).json({ error: response.error.message });
          } else {
            res.status(500).json({ error: "Unknown error occurred" });
          }
        } catch (error) {
          console.error(`Error calling tool ${name}:`, error);
          res.status(500).json({ error: String(error) });
        }
        return;
      } else if (message.method === "tools/list") {
        const allTools = [];
        const servers = serverManager.getAllServers();
        
        console.log(`Collecting tools from ${servers.length} running servers`);
        
        for (const server of servers) {
          if (server.transport) {
            try {
              const response = await server.transport.send({
                jsonrpc: "2.0",
                method: "tools/list",
                params: {},
                id: message.id || 0
              });
              
              if (response.result?.tools) {
                console.log(`Got ${response.result.tools.length} tools from ${server.name}`);
                // Transform tools to match expected format
                const serverTools = response.result.tools.map(tool => {
                  // Handle potential different property names in the response
                  const inputSchema = (tool as any).inputSchema || (tool as any).input_schema;
                  return {
                    name: tool.name,
                    description: tool.description,
                    server: server.name,
                    input_schema: inputSchema
                  };
                });
                allTools.push(...serverTools);
              }
            } catch (error) {
              console.error(`Error getting tools from ${server.name}:`, error);
            }
          }
        }
        
        console.log(`Returning ${allTools.length} total tools:`, JSON.stringify(allTools, null, 2));
        res.json({
          tools: allTools
        });
        return;
      }
    }

    const transport = webAppTransports.find((t) => t.sessionId === sessionId);
    if (!transport) {
      res.status(404).end("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Error in /message route:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.get("/servers", async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(Object.keys(config.mcp.servers));
  } catch (error) {
    console.error("Error in /servers route:", error);
    res.status(500).json({ error: String(error) });
  }
});

const PORT = process.env.PORT || 8808;

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await serverManager.stopAllServers();
  process.exit(0);
});

async function startAllServers() {
  try {
    const config = await loadConfig();
    console.log("Starting all configured MCP servers...");
    
    for (const [name, serverConfig] of Object.entries(config.mcp.servers)) {
      try {
        console.log(`Starting server: ${name}`);
        await serverManager.startServer(name, serverConfig);
        console.log(`Successfully started server: ${name}`);
      } catch (error) {
        console.error(`Failed to start server ${name}:`, error);
      }
    }
  } catch (error) {
    console.error("Failed to start servers:", error);
  }
}

try {
  const server = app.listen(PORT, async () => {
    console.log(`MCP Gateway listening on port ${PORT} (http://localhost:${PORT})`);
    await startAllServers();
  });

  server.on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
}
