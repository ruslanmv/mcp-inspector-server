import type { AppConfig } from '../config.js';
import type { ReportStore } from '../tools/report.js';
import type { RingLogStore } from '../tools/logs.js';

export function configResource(config: AppConfig) {
  return {
    name: 'inspector-config',
    uri: 'inspector://config',
    title: 'Inspector Server Configuration',
    mimeType: 'application/json',
    text: JSON.stringify(
      {
        name: config.MCP_SERVER_NAME,
        version: config.MCP_SERVER_VERSION,
        authEnabled: config.authEnabled,
        allowedTargets: config.allowedTargets,
        timeoutMs: config.INSPECTOR_TIMEOUT_MS,
        maxToolResultBytes: config.INSPECTOR_MAX_TOOL_RESULT_BYTES
      },
      null,
      2
    )
  };
}

export function latestLogsResource(logs: RingLogStore) {
  return {
    name: 'inspector-latest-logs',
    uri: 'inspector://logs/latest',
    title: 'Latest Inspector Logs',
    mimeType: 'application/json',
    text: JSON.stringify(logs.list(100), null, 2)
  };
}

export function latestReportResource(reports: ReportStore, targetUrl: string) {
  const report = reports.latestForTarget(targetUrl);
  return {
    name: 'inspector-latest-report',
    uri: `inspector://reports/latest?targetUrl=${encodeURIComponent(targetUrl)}`,
    title: 'Latest Inspector Report',
    mimeType: 'application/json',
    text: JSON.stringify(report ?? { message: 'No report found for target.' }, null, 2)
  };
}
