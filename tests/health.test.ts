import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createHealthTools } from '../src/tools/health.js';
import { assertAllowedTarget } from '../src/config.js';

describe('health tools', () => {
  it('normalizes and allows exact target URLs', () => {
    const allowed = ['http://example.com/mcp'];
    expect(assertAllowedTarget('http://example.com/mcp', allowed)).toBe('http://example.com/mcp');
  });

  it('rejects non-allowlisted targets', () => {
    expect(() => assertAllowedTarget('http://169.254.169.254/latest/meta-data', ['http://safe.local/mcp'])).toThrow(
      /not allowlisted/
    );
  });

  it('delegates ping to the inspector client', async () => {
    const mockClient = { ping: vi.fn().mockResolvedValue({ ok: true }) } as any;
    const tools = createHealthTools(mockClient);
    await expect(tools.pingServer({ targetUrl: 'http://safe.local/mcp' })).resolves.toEqual({ ok: true });
    expect(mockClient.ping).toHaveBeenCalledWith('http://safe.local/mcp', undefined);
  });
});
