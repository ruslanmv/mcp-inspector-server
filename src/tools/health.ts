import { z } from 'zod';
import type { InspectorClient } from '../inspector-client.js';

export const targetAuthHeadersSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe('Optional headers forwarded to the target MCP server, for example Authorization.');

export const pingServerInput = {
  targetUrl: z.string().url().describe('Allowlisted Streamable HTTP MCP endpoint to ping.'),
  headers: targetAuthHeadersSchema
};

export const listCapabilitiesInput = {
  targetUrl: z.string().url().describe('Allowlisted Streamable HTTP MCP endpoint to inspect.'),
  headers: targetAuthHeadersSchema
};

export function createHealthTools(client: InspectorClient) {
  return {
    async pingServer(input: z.infer<z.ZodObject<typeof pingServerInput>>) {
      return client.ping(input.targetUrl, input.headers);
    },
    async listCapabilities(input: z.infer<z.ZodObject<typeof listCapabilitiesInput>>) {
      return client.listCapabilities(input.targetUrl, input.headers);
    }
  };
}
