import { findActualExecutable } from "spawn-rx";
import { parse as shellParseArgs } from "shell-quote";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServer, MCPServerConfig } from "./types.js";
import { MCPTransportWrapper } from "./transport.js";
import { ChildProcess, spawn } from "child_process";

interface ExecutableResult {
  cmd: string;
  args: string[];
}

const defaultEnvironment = {
  ...getDefaultEnvironment(),
  ...(process.env.MCP_ENV_VARS ? JSON.parse(process.env.MCP_ENV_VARS) : {})
};

export class ServerManager {
  private servers: Map<string, MCPServer> = new Map();

  async startServer(name: string, config: MCPServerConfig): Promise<MCPServer> {
    if (this.servers.has(name)) {
      throw new Error(`Server ${name} is already running`);
    }

    console.log(`Starting MCP server ${name} with command: ${config.command}`);
    
    const executable = await findActualExecutable(config.command, []) as ExecutableResult;
    const executablePath = executable.cmd;
    console.log(`Resolved executable path: ${executablePath}`);
    
    const parsedArgs = config.args.map(arg => 
      typeof arg === 'string' ? shellParseArgs(arg)[0] : arg
    ).filter((arg): arg is string => typeof arg === 'string');
    console.log(`Parsed arguments: ${parsedArgs.join(' ')}`);

    const env = {
      ...defaultEnvironment,
      ...config.env
    };
    console.log(`Environment variables: ${Object.keys(env).join(', ')}`);

    console.log(`Spawning process: ${executablePath} ${parsedArgs.join(' ')}`);
    const process = spawn(executablePath, parsedArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    }) as ChildProcess;

    // Add stdout and stderr logging
    if (!process.stdout || !process.stderr) {
      throw new Error(`Failed to initialize process streams for ${name}`);
    }

    process.stdout.on('data', (data) => {
      console.log(`[${name}] stdout: ${data.toString().trim()}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`[${name}] stderr: ${data.toString().trim()}`);
    });

    const server: MCPServer = {
      name,
      config,
      process
    };

    const stdioTransport = new StdioClientTransport({
      command: executablePath,
      args: parsedArgs,
      env,
      stderr: "pipe"
    });

    await stdioTransport.start();
    server.transport = new MCPTransportWrapper(stdioTransport);

    // Handle process errors and cleanup
    process.on('error', (error: Error) => {
      console.error(`Error in MCP server ${name}:`, error);
      this.stopServer(name).catch(console.error);
    });

    process.on('exit', (code: number | null) => {
      console.log(`MCP server ${name} exited with code ${code}`);
      this.servers.delete(name);
    });

    this.servers.set(name, server);
    return server;
  }

  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      return;
    }

    if (server.transport) {
      try {
        await server.transport.close();
      } catch (error) {
        console.error(`Error closing transport for ${name}:`, error);
      }
    }

    server.process.kill();
    this.servers.delete(name);
  }

  async stopAllServers(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map(name => 
      this.stopServer(name)
    );
    await Promise.all(promises);
  }

  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }
}
