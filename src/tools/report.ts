import { z } from 'zod';
import type { InspectorClient } from '../inspector-client.js';
import type { RingLogStore } from './logs.js';
import { createContractTools, runContractTestsInput } from './contract.js';

export interface DiagnosticReport {
  id: string;
  targetUrl: string;
  createdAt: string;
  status: 'pass' | 'fail';
  summary: string;
  contract: unknown;
  recentLogs: unknown[];
}

export class ReportStore {
  private reports = new Map<string, DiagnosticReport>();

  set(report: DiagnosticReport) {
    this.reports.set(report.id, report);
    return report;
  }

  get(id: string) {
    return this.reports.get(id);
  }

  latestForTarget(targetUrl: string) {
    return [...this.reports.values()].filter((r) => r.targetUrl === targetUrl).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
}

export const generateReportInput = {
  ...runContractTestsInput
};

export function createReportTools(client: InspectorClient, logs: RingLogStore, reports: ReportStore) {
  const contractTools = createContractTools(client);
  return {
    async generateReport(input: z.infer<z.ZodObject<typeof runContractTestsInput>>) {
      const contract = await contractTools.runContractTests(input);
      const id = Buffer.from(`${input.targetUrl}:${Date.now()}`).toString('base64url');
      const report: DiagnosticReport = {
        id,
        targetUrl: input.targetUrl,
        createdAt: new Date().toISOString(),
        status: contract.status as 'pass' | 'fail',
        summary: contract.status === 'pass' ? 'Target MCP server passed inspection.' : 'Target MCP server failed one or more inspection checks.',
        contract,
        recentLogs: logs.list(50, input.targetUrl)
      };
      return reports.set(report);
    }
  };
}
