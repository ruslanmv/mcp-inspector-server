import { describe, expect, it, vi } from 'vitest';
import { createContractTools } from '../src/tools/contract.js';

describe('contract tools', () => {
  it('passes a valid tool schema', async () => {
    const mockClient = {
      listCapabilities: vi.fn().mockResolvedValue({
        tools: [{ name: 'demo.echo', description: 'Echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }],
        resources: [],
        prompts: []
      })
    } as any;
    const tools = createContractTools(mockClient);
    const result = await tools.validateToolSchema({ targetUrl: 'http://safe.local/mcp' });
    expect(result.status).toBe('pass');
  });

  it('fails when a requested tool is missing', async () => {
    const mockClient = {
      listCapabilities: vi.fn().mockResolvedValue({ tools: [], resources: [], prompts: [] })
    } as any;
    const tools = createContractTools(mockClient);
    const result = await tools.validateToolSchema({ targetUrl: 'http://safe.local/mcp', toolName: 'missing.tool' });
    expect(result.status).toBe('fail');
  });

  it('runs baseline contract tests', async () => {
    const mockClient = {
      ping: vi.fn().mockResolvedValue({ ok: true }),
      listCapabilities: vi.fn().mockResolvedValue({ tools: [], resources: [], prompts: [] })
    } as any;
    const tools = createContractTools(mockClient);
    const result = await tools.runContractTests({
      targetUrl: 'http://safe.local/mcp',
      includeToolInvocation: false,
      noArgToolNames: []
    });
    expect(result.status).toBe('pass');
    expect(result.checks.map((c) => c.name)).toContain('initialize');
  });
});
