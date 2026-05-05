import { z } from 'zod';
import type { InspectorClient } from '../inspector-client.js';
import { targetAuthHeadersSchema } from './health.js';
import { createContractTools, type ContractCheck } from './contract.js';

/**
 * Aggregate validation across multiple MCP servers.
 *
 * GitPilot calls this once after Context Forge boots to confirm that every
 * attached MCP server (postgre, milvus, others) is healthy, advertises tools,
 * and exposes the schemas its agents expect. Returning a single roll-up keeps
 * the agent context window small -- the per-server transcript stays in the
 * inspector, only the verdict comes back.
 */

export const batchValidateInput = {
  targets: z
    .array(
      z.object({
        name: z.string().describe('Display name, e.g. "mcp-postgre-server".'),
        targetUrl: z.string().url().describe('Allowlisted MCP endpoint URL.'),
        requiredTools: z
          .array(z.string())
          .default([])
          .describe('Tool names that MUST be present for this target to be considered healthy.'),
        headers: targetAuthHeadersSchema
      })
    )
    .min(1)
    .describe('List of MCP servers to validate.'),
  includeContractTests: z
    .boolean()
    .default(true)
    .describe('When true, also run the full contract test suite per target.'),
  failFast: z
    .boolean()
    .default(false)
    .describe('Stop on the first failing target instead of validating all.')
};

export interface BatchTargetResult {
  name: string;
  targetUrl: string;
  healthy: boolean;
  responseTimeMs: number | null;
  toolCount: number;
  missingRequiredTools: string[];
  contractChecks?: ContractCheck[];
  error?: string;
}

export interface BatchValidateOutput {
  generatedAt: string;
  totalTargets: number;
  healthyTargets: number;
  unhealthyTargets: number;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  results: BatchTargetResult[];
}

export function createBatchTools(client: InspectorClient) {
  const contract = createContractTools(client);

  return {
    async batchValidate(
      input: z.infer<z.ZodObject<typeof batchValidateInput>>
    ): Promise<BatchValidateOutput> {
      const results: BatchTargetResult[] = [];

      for (const target of input.targets) {
        const startedAt = Date.now();
        const out: BatchTargetResult = {
          name: target.name,
          targetUrl: target.targetUrl,
          healthy: false,
          responseTimeMs: null,
          toolCount: 0,
          missingRequiredTools: []
        };

        try {
          const ping = (await client.ping(target.targetUrl, target.headers)) as
            | { ok?: boolean; message?: string }
            | undefined;
          out.responseTimeMs = Date.now() - startedAt;

          if (!ping?.ok) {
            out.error = ping?.message ?? 'ping failed';
            results.push(out);
            if (input.failFast) break;
            continue;
          }

          const caps = (await client.listCapabilities(
            target.targetUrl,
            target.headers
          )) as { tools?: { name: string }[] } | undefined;
          const toolNames = (caps?.tools ?? []).map((t) => t.name);
          out.toolCount = toolNames.length;

          const missing = (target.requiredTools ?? []).filter(
            (req: string) => !toolNames.includes(req)
          );
          out.missingRequiredTools = missing;

          if (input.includeContractTests) {
            try {
              const report = await contract.runContractTests({
                targetUrl: target.targetUrl,
                includeToolInvocation: false,
                noArgToolNames: [],
                headers: target.headers
              });
              out.contractChecks = (report?.checks ?? []) as ContractCheck[];
            } catch (err) {
              out.contractChecks = [
                {
                  name: 'contract-tests',
                  status: 'fail',
                  message: err instanceof Error ? err.message : String(err)
                }
              ];
            }
          }

          out.healthy =
            missing.length === 0 &&
            !(out.contractChecks ?? []).some((c) => c.status === 'fail');
        } catch (err) {
          out.error = err instanceof Error ? err.message : String(err);
        }

        results.push(out);
        if (input.failFast && !out.healthy) break;
      }

      const healthy = results.filter((r) => r.healthy).length;
      const total = results.length;
      const overall: BatchValidateOutput['overallStatus'] =
        healthy === total ? 'healthy' : healthy === 0 ? 'unhealthy' : 'degraded';

      return {
        generatedAt: new Date().toISOString(),
        totalTargets: total,
        healthyTargets: healthy,
        unhealthyTargets: total - healthy,
        overallStatus: overall,
        results
      };
    }
  };
}
