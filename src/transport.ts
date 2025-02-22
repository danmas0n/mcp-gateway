import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JsonRpcResponse } from "./types.js";

export class MCPTransportWrapper {
  constructor(private transport: Transport) {}

  private messageId = 0;

  async send(message: any): Promise<JsonRpcResponse> {
    // Ensure message has jsonrpc and id fields
    const jsonRpcMessage = {
      jsonrpc: "2.0",
      id: this.messageId++,
      ...message
    };
    
    console.log('MCPTransportWrapper sending message:', jsonRpcMessage);
    
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.transport.onmessage = this._onmessage;
        reject(new Error(`Timeout waiting for response to message: ${JSON.stringify(jsonRpcMessage)}`));
      }, 5000);

      const handler = (response: any) => {
        console.log('MCPTransportWrapper received response:', response);
        if (response.id === jsonRpcMessage.id) {
          clearTimeout(timeoutId);
          this.transport.onmessage = this._onmessage;
          resolve(response as JsonRpcResponse);
        } else if (this._onmessage) {
          console.log('MCPTransportWrapper forwarding non-matching response');
          this._onmessage(response);
        }
      };
      this.transport.onmessage = handler;
    });

    try {
      await this.transport.send(jsonRpcMessage);
      console.log('MCPTransportWrapper sent message successfully');
      return responsePromise;
    } catch (error) {
      console.error('MCPTransportWrapper failed to send message:', error);
      throw error;
    }
  }

  private _onmessage?: (message: any) => void;
  private _onclose?: () => void;
  private _onerror?: (error: Error) => void;

  get onmessage(): ((message: any) => void) | undefined {
    return this._onmessage;
  }

  set onmessage(handler: ((message: any) => void) | undefined) {
    this._onmessage = handler;
    this.transport.onmessage = handler;
  }

  get onclose(): (() => void) | undefined {
    return this._onclose;
  }

  set onclose(handler: (() => void) | undefined) {
    this._onclose = handler;
    this.transport.onclose = handler;
  }

  get onerror(): ((error: Error) => void) | undefined {
    return this._onerror;
  }

  set onerror(handler: ((error: Error) => void) | undefined) {
    this._onerror = handler;
    this.transport.onerror = handler;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
