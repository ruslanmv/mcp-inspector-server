import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(8081),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  MCP_SERVER_NAME: z.string().default('mcp-inspector-server'),
  MCP_SERVER_VERSION: z.string().default('0.1.0'),
  MCP_AUTH_TOKEN: z.string().optional().default(''),
  INSPECTOR_ALLOWED_TARGETS: z.string().default(''),
  INSPECTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  INSPECTOR_MAX_TOOL_RESULT_BYTES: z.coerce.number().int().positive().default(262_144),
  INSPECTOR_MAX_LOG_EVENTS: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120)
});

export type AppConfig = ReturnType<typeof loadConfig>;

function normalizeTarget(raw: string): string {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported target protocol: ${url.protocol}`);
  }
  url.hash = '';
  return url.toString();
}

export function loadConfig() {
  const parsed = envSchema.parse(process.env);
  const allowedTargets = parsed.INSPECTOR_ALLOWED_TARGETS.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeTarget);

  return {
    ...parsed,
    allowedTargets,
    authEnabled: parsed.MCP_AUTH_TOKEN.length > 0 && parsed.MCP_AUTH_TOKEN !== 'change-me'
  };
}

export function assertAllowedTarget(targetUrl: string, allowedTargets: string[]): string {
  const normalized = normalizeTarget(targetUrl);
  if (!allowedTargets.includes(normalized)) {
    throw new Error(`Target is not allowlisted: ${normalized}`);
  }
  return normalized;
}
