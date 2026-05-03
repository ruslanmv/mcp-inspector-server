import { describe, expect, it, vi } from 'vitest';
import { createInvokeTools } from '../src/tools/invoke.js';

describe('invoke tools', () => {
  it('delegates tool invocation to the inspector client', async () => {
    const mockClient = { invokeTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } as any;
    const tools = createInvokeTools(mockClient);
    const result = await tools.invokeToolTest({
      targetUrl: 'http://safe.local/mcp',
      toolName: 'demo.echo',
      arguments: { text: 'hello' }
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(mockClient.invokeTool).toHaveBeenCalledWith('http://safe.local/mcp', 'demo.echo', { text: 'hello' }, undefined);
  });
});
