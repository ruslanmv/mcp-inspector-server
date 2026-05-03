import { z } from 'zod';
import type { InspectorClient } from '../inspector-client.js';
import { targetAuthHeadersSchema } from './health.js';

export const invokeToolInput = {
  targetUrl: z.string().url().describe('Allowlisted Streamable HTTP MCP endpoint.'),
  toolName: z.string().min(1).describe('Name of the target MCP tool to invoke.'),
  arguments: z.record(z.string(), z.unknown()).default({}).describe('JSON object arguments for the target tool.'),
  headers: targetAuthHeadersSchema
};

export function createInvokeTools(client: InspectorClient) {
  return {
    async invokeToolTest(input: z.infer<z.ZodObject<typeof invokeToolInput>>) {
      return client.invokeTool(input.targetUrl, input.toolName, input.arguments, input.headers);
    }
  };
}
