import { MCPTransportWrapper } from "./transport.js";
import { ChildProcess } from "child_process";

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPServer {
  name: string;
  config: MCPServerConfig;
  process: ChildProcess;
  transport?: MCPTransportWrapper;
}

export interface Config {
  mcp: {
    servers: Record<string, MCPServerConfig>;
  };
}

export interface MCPTool {
  name: string;
  description?: string;
  server?: string;
  input_schema?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: {
    tools?: MCPTool[];
    [key: string]: any;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
