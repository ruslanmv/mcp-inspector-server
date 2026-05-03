import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { assertAllowedTarget, type AppConfig } from './config.js';
import type { RingLogStore } from './tools/logs.js';

export interface TargetClientOptions {
  targetUrl: string;
  headers?: Record<string, string>;
}

export interface TargetCapabilities {
  tools: unknown[];
  resources: unknown[];
  prompts: unknown[];
}

export class InspectorClient {
  constructor(
    private readonly config: AppConfig,
    private readonly logs: RingLogStore
  ) {}

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)));
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect<T>(options: TargetClientOptions, fn: (client: Client) => Promise<T>): Promise<T> {
    const targetUrl = assertAllowedTarget(options.targetUrl, this.config.allowedTargets);
    const client = new Client({ name: this.config.MCP_SERVER_NAME, version: this.config.MCP_SERVER_VERSION });
    const transport = new StreamableHTTPClientTransport(new URL(targetUrl), {
      requestInit: {
        headers: options.headers ?? {}
      }
    });

    this.logs.add({ level: 'info', event: 'connect.start', targetUrl });
    try {
      await this.withTimeout(client.connect(transport), this.config.INSPECTOR_TIMEOUT_MS, 'MCP connect');
      const result = await this.withTimeout(fn(client), this.config.INSPECTOR_TIMEOUT_MS, 'MCP operation');
      this.logs.add({ level: 'info', event: 'connect.success', targetUrl });
      return result;
    } catch (error) {
      this.logs.add({ level: 'error', event: 'connect.error', targetUrl, details: error instanceof Error ? error.message : error });
      throw error;
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async ping(targetUrl: string, headers?: Record<string, string>) {
    return this.connect({ targetUrl, headers }, async (client) => {
      const serverVersion = client.getServerVersion();
      const capabilities = client.getServerCapabilities();
      return { ok: true, serverVersion, capabilities };
    });
  }

  async listCapabilities(targetUrl: string, headers?: Record<string, string>): Promise<TargetCapabilities> {
    return this.connect({ targetUrl, headers }, async (client) => {
      const [tools, resources, prompts] = await Promise.all([
        client.listTools().then((r) => r.tools ?? []).catch(() => []),
        client.listResources().then((r) => r.resources ?? []).catch(() => []),
        client.listPrompts().then((r) => r.prompts ?? []).catch(() => [])
      ]);
      return { tools, resources, prompts };
    });
  }

  async invokeTool(targetUrl: string, name: string, args: Record<string, unknown>, headers?: Record<string, string>) {
    return this.connect({ targetUrl, headers }, async (client) => {
      const result = await client.callTool({ name, arguments: args });
      const encoded = JSON.stringify(result);
      if (Buffer.byteLength(encoded, 'utf8') > this.config.INSPECTOR_MAX_TOOL_RESULT_BYTES) {
        throw new Error(`Tool result exceeds byte limit ${this.config.INSPECTOR_MAX_TOOL_RESULT_BYTES}`);
      }
      return result;
    });
  }
}
