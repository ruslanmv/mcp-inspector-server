import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { InspectorClient } from './inspector-client.js';
import { RingLogStore } from './tools/logs.js';
import { createHealthTools, listCapabilitiesInput, pingServerInput } from './tools/health.js';
import { createInvokeTools, invokeToolInput } from './tools/invoke.js';
import { createContractTools, runContractTestsInput, validateToolSchemaInput } from './tools/contract.js';
import { createReportTools, generateReportInput, ReportStore } from './tools/report.js';
import { createBatchTools, batchValidateInput } from './tools/batch.js';
import { configResource, latestLogsResource } from './resources/diagnostic-resources.js';
import { fixMcpServerPrompt, inspectBeforePrPrompt } from './prompts/debugging-prompts.js';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const logs = new RingLogStore(config.INSPECTOR_MAX_LOG_EVENTS);
const reports = new ReportStore();
const inspectorClient = new InspectorClient(config, logs);

function asTextContent(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ]
  };
}

export function createMcpServer() {
  const server = new McpServer({ name: config.MCP_SERVER_NAME, version: config.MCP_SERVER_VERSION });
  const healthTools = createHealthTools(inspectorClient);
  const invokeTools = createInvokeTools(inspectorClient);
  const contractTools = createContractTools(inspectorClient);
  const reportTools = createReportTools(inspectorClient, logs, reports);
  const batchTools = createBatchTools(inspectorClient);

  server.registerTool(
    'inspector.ping_server',
    {
      title: 'Ping MCP Server',
      description: 'Initialize an allowlisted target MCP server and return its version and capabilities.',
      inputSchema: pingServerInput
    },
    async (args) => asTextContent(await healthTools.pingServer(args))
  );

  server.registerTool(
    'inspector.list_capabilities',
    {
      title: 'List MCP Capabilities',
      description: 'List tools, resources, and prompts from an allowlisted target MCP server.',
      inputSchema: listCapabilitiesInput
    },
    async (args) => asTextContent(await healthTools.listCapabilities(args))
  );

  server.registerTool(
    'inspector.validate_tool_schema',
    {
      title: 'Validate Tool Schema',
      description: 'Validate the basic JSON-schema shape of one or all target MCP tools.',
      inputSchema: validateToolSchemaInput
    },
    async (args) => asTextContent(await contractTools.validateToolSchema(args))
  );

  server.registerTool(
    'inspector.invoke_tool_test',
    {
      title: 'Invoke Tool Test',
      description: 'Invoke one safe target MCP tool with supplied JSON arguments. Use only for non-mutating tools unless approved.',
      inputSchema: invokeToolInput
    },
    async (args) => asTextContent(await invokeTools.invokeToolTest(args))
  );

  server.registerTool(
    'inspector.run_contract_tests',
    {
      title: 'Run MCP Contract Tests',
      description: 'Run initialization, listing, schema validation, and optional safe no-arg tool invocation checks.',
      inputSchema: runContractTestsInput
    },
    async (args) => asTextContent(await contractTools.runContractTests(args))
  );

  server.registerTool(
    'inspector.batch_validate',
    {
      title: 'Batch-validate MCP Servers',
      description:
        'Validate every attached MCP server in one call: ping, list capabilities, check required tools, and (optionally) run contract tests. Designed for GitPilot to call once at startup.',
      inputSchema: batchValidateInput
    },
    async (args) => asTextContent(await batchTools.batchValidate(args))
  );

  server.registerTool(
    'inspector.generate_report',
    {
      title: 'Generate Diagnostic Report',
      description: 'Generate and store a diagnostic report for a target MCP server.',
      inputSchema: generateReportInput
    },
    async (args) => asTextContent(await reportTools.generateReport(args))
  );

  server.registerTool(
    'inspector.list_logs',
    {
      title: 'List Inspector Logs',
      description: 'Return recent in-memory inspector events. Does not expose target secrets.',
      inputSchema: {
        limit: z.number().int().min(1).max(1000).default(100),
        targetUrl: z.string().url().optional()
      }
    },
    async ({ limit, targetUrl }) => asTextContent(logs.list(limit, targetUrl))
  );

  server.registerResource(
    'inspector-config',
    'inspector://config',
    {
      title: 'Inspector Server Configuration',
      description: 'Runtime configuration excluding secrets.',
      mimeType: 'application/json'
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: configResource(config).text }] })
  );

  server.registerResource(
    'inspector-latest-logs',
    'inspector://logs/latest',
    {
      title: 'Latest Inspector Logs',
      description: 'Recent inspector activity.',
      mimeType: 'application/json'
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: latestLogsResource(logs).text }] })
  );

  server.registerPrompt(
    'inspector.fix_mcp_server',
    {
      title: 'Fix MCP Server',
      description: 'Debug and repair a failing MCP server using inspector tools.',
      argsSchema: {}
    },
    async () => ({ messages: [{ role: 'user', content: { type: 'text', text: fixMcpServerPrompt } }] })
  );

  server.registerPrompt(
    'inspector.before_pr_review',
    {
      title: 'MCP PR Review Checklist',
      description: 'Checklist for reviewing MCP server changes before pull request creation.',
      argsSchema: {}
    },
    async () => ({ messages: [{ role: 'user', content: { type: 'text', text: inspectBeforePrPrompt } }] })
  );

  return server;
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.authEnabled) return next();
  const auth = req.header('authorization') ?? '';
  const expected = `Bearer ${config.MCP_AUTH_TOKEN}`;
  if (auth !== expected) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

export function createHttpApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', server: config.MCP_SERVER_NAME, version: config.MCP_SERVER_VERSION });
  });

  app.get('/ready', (_req, res) => {
    res.json({
      status: 'ready',
      server: config.MCP_SERVER_NAME,
      allowedTargets: config.allowedTargets.length,
      authEnabled: config.authEnabled
    });
  });

  app.post('/mcp', authMiddleware, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({ error: 'Use POST /mcp for Streamable HTTP MCP requests.' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled request error');
    logs.add({ level: 'error', event: 'http.unhandled_error', details: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = createHttpApp();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, 'mcp-inspector-server listening');
  });

  const shutdown = () => {
    logger.info('shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
