import { describe, expect, it, vi } from 'vitest';
import { createBatchTools } from '../src/tools/batch.js';

function makeFakeClient(overrides: Partial<{
  ping: ReturnType<typeof vi.fn>;
  listCapabilities: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    ping: overrides.ping ?? vi.fn(async () => ({ ok: true, message: 'pong' })),
    listCapabilities:
      overrides.listCapabilities ??
      vi.fn(async () => ({
        tools: [{ name: 'postgres.list_databases' }, { name: 'postgres.describe_table' }],
        resources: [],
        prompts: []
      }))
  } as unknown as Parameters<typeof createBatchTools>[0];
}

describe('inspector.batch_validate', () => {
  it('returns healthy when all targets ping and required tools are present', async () => {
    const tools = createBatchTools(makeFakeClient());
    const out = await tools.batchValidate({
      targets: [
        {
          name: 'mcp-postgre-server',
          targetUrl: 'http://localhost:8080/mcp',
          requiredTools: ['postgres.list_databases']
        }
      ],
      includeContractTests: false,
      failFast: false
    });
    expect(out.overallStatus).toBe('healthy');
    expect(out.healthyTargets).toBe(1);
    expect(out.results[0].missingRequiredTools).toEqual([]);
  });

  it('reports missing required tools and marks the target unhealthy', async () => {
    const tools = createBatchTools(makeFakeClient());
    const out = await tools.batchValidate({
      targets: [
        {
          name: 'mcp-postgre-server',
          targetUrl: 'http://localhost:8080/mcp',
          requiredTools: ['postgres.generate_repository_context']
        }
      ],
      includeContractTests: false,
      failFast: false
    });
    expect(out.overallStatus).toBe('unhealthy');
    expect(out.results[0].missingRequiredTools).toEqual([
      'postgres.generate_repository_context'
    ]);
  });

  it('respects failFast', async () => {
    const ping = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'unreachable' })
      .mockResolvedValueOnce({ ok: true, message: 'pong' });
    const tools = createBatchTools(makeFakeClient({ ping }));
    const out = await tools.batchValidate({
      targets: [
        { name: 'a', targetUrl: 'http://a/mcp', requiredTools: [] },
        { name: 'b', targetUrl: 'http://b/mcp', requiredTools: [] }
      ],
      includeContractTests: false,
      failFast: true
    });
    expect(out.results).toHaveLength(1);
    expect(out.overallStatus).toBe('unhealthy');
  });
});
