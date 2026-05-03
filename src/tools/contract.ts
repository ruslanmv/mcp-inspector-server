import { z } from 'zod';
import type { InspectorClient } from '../inspector-client.js';
import { targetAuthHeadersSchema } from './health.js';

export const validateToolSchemaInput = {
  targetUrl: z.string().url(),
  toolName: z.string().optional().describe('Optional single tool name. If omitted, all tools are validated.'),
  headers: targetAuthHeadersSchema
};

export const runContractTestsInput = {
  targetUrl: z.string().url(),
  includeToolInvocation: z.boolean().default(false).describe('When true, invoke tools listed in noArgToolNames with empty arguments.'),
  noArgToolNames: z.array(z.string()).default([]).describe('Safe tools that can be invoked with empty arguments.'),
  headers: targetAuthHeadersSchema
};

export interface ContractCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

function validateJsonSchemaLike(schema: unknown): string[] {
  const errors: string[] = [];
  if (schema === undefined || schema === null) return errors;
  if (typeof schema !== 'object') {
    errors.push('inputSchema must be an object when present');
    return errors;
  }
  const obj = schema as Record<string, unknown>;
  if (obj.type !== undefined && typeof obj.type !== 'string') errors.push('inputSchema.type must be a string');
  if (obj.properties !== undefined && (typeof obj.properties !== 'object' || obj.properties === null || Array.isArray(obj.properties))) {
    errors.push('inputSchema.properties must be an object');
  }
  return errors;
}

export function createContractTools(client: InspectorClient) {
  async function validateToolSchema(input: z.infer<z.ZodObject<typeof validateToolSchemaInput>>) {
    const capabilities = await client.listCapabilities(input.targetUrl, input.headers);
    const tools = capabilities.tools as Array<Record<string, unknown>>;
    const selected = input.toolName ? tools.filter((tool) => tool.name === input.toolName) : tools;
    if (input.toolName && selected.length === 0) {
      return { status: 'fail', errors: [`Tool not found: ${input.toolName}`], tools: [] };
    }
    const results = selected.map((tool) => {
      const errors: string[] = [];
      if (typeof tool.name !== 'string' || tool.name.length === 0) errors.push('tool.name is required');
      if (tool.description !== undefined && typeof tool.description !== 'string') errors.push('tool.description must be a string');
      errors.push(...validateJsonSchemaLike(tool.inputSchema));
      return { name: String(tool.name ?? '<missing>'), status: errors.length ? 'fail' : 'pass', errors };
    });
    return { status: results.some((r) => r.status === 'fail') ? 'fail' : 'pass', tools: results };
  }

  return {
    validateToolSchema,

    async runContractTests(input: z.infer<z.ZodObject<typeof runContractTestsInput>>) {
      const checks: ContractCheck[] = [];
      try {
        const ping = await client.ping(input.targetUrl, input.headers);
        checks.push({ name: 'initialize', status: ping.ok ? 'pass' : 'fail', message: ping.ok ? 'Target initialized' : 'Target did not initialize' });
      } catch (error) {
        checks.push({ name: 'initialize', status: 'fail', message: error instanceof Error ? error.message : String(error) });
        return { status: 'fail', checks };
      }

      const capabilities = await client.listCapabilities(input.targetUrl, input.headers);
      checks.push({ name: 'tools/list', status: 'pass', message: `${capabilities.tools.length} tools returned` });
      checks.push({ name: 'resources/list', status: 'pass', message: `${capabilities.resources.length} resources returned` });
      checks.push({ name: 'prompts/list', status: 'pass', message: `${capabilities.prompts.length} prompts returned` });

      const schemaResult = await validateToolSchema({ targetUrl: input.targetUrl, headers: input.headers });
      checks.push({
        name: 'tool-schema-validation',
        status: schemaResult.status === 'pass' ? 'pass' : 'fail',
        message: schemaResult.status === 'pass' ? 'All listed tools have valid basic schemas' : 'One or more tool schemas failed validation'
      });

      if (input.includeToolInvocation) {
        for (const toolName of input.noArgToolNames) {
          try {
            await client.invokeTool(input.targetUrl, toolName, {}, input.headers);
            checks.push({ name: `tools/call:${toolName}`, status: 'pass', message: 'Invocation succeeded' });
          } catch (error) {
            checks.push({ name: `tools/call:${toolName}`, status: 'fail', message: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      return { status: checks.some((c) => c.status === 'fail') ? 'fail' : 'pass', checks };
    }
  };
}
