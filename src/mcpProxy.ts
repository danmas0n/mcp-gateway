import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { MCPTransportWrapper } from "./transport.js";

function onClientError(error: Error) {
  console.error("Error from client:", error);
}

function onServerError(error: Error) {
  console.error("Error from MCP server:", error);
}

export default function mcpProxy({
  transportToClient,
  transportToServer,
}: {
  transportToClient: Transport;
  transportToServer: MCPTransportWrapper;
}) {
  let transportToClientClosed = false;
  let transportToServerClosed = false;

  transportToClient.onmessage = async (message: any) => {
    console.log('mcpProxy: Client -> Server:', message);
    try {
      // For tools/list, we handle it in the main server
      if (message?.method === 'tools/list') {
        return;
      }
      await transportToServer.send(message);
    } catch (error) {
      console.error('mcpProxy: Error forwarding client message:', error);
      onServerError(error as Error);
    }
  };

  transportToServer.onmessage = async (message: any) => {
    console.log('mcpProxy: Server -> Client:', message);
    try {
      // For tools/list responses, we let the main server handle it
      if (message.id === 0 && message.result?.tools) {
        return;
      }
      await transportToClient.send(message);
    } catch (error) {
      console.error('mcpProxy: Error forwarding server message:', error);
      onClientError(error as Error);
    }
  };

  transportToClient.onclose = () => {
    if (transportToServerClosed) {
      return;
    }

    transportToClientClosed = true;
    transportToServer.close().catch(onServerError);
  };

  transportToServer.onclose = () => {
    if (transportToClientClosed) {
      return;
    }

    transportToServerClosed = true;
    transportToClient.close().catch(onClientError);
  };

  transportToClient.onerror = onClientError;
  transportToServer.onerror = onServerError;
}
