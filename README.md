# mcp-inspector-server

Production-ready MCP server that inspects, validates, invokes, and reports on other MCP servers through a safe allowlisted interface.

This server is designed to sit behind **MCP Context Forge** and be used by GitPilot or another coding agent during code generation, test generation, and MCP server review.

## Why this exists

The official MCP Inspector is an interactive developer tool for testing and debugging MCP servers. This project turns the same inspection workflow into an MCP-accessible backend service so an agent can call inspection tools programmatically.

## Features

- Streamable HTTP MCP endpoint at `/mcp`
- REST health endpoints at `/health` and `/ready`
- allowlisted target MCP endpoints to reduce SSRF risk
- optional bearer-token authentication
- rate limiting, helmet headers, non-root Docker image
- target MCP initialization check
- capability listing for tools, resources, and prompts
- basic tool schema validation
- safe tool invocation for test scenarios
- contract test report generation
- in-memory diagnostic log resource
- Context Forge registration file
- Vitest tests

## Tools

| Tool | Description |
|---|---|
| `inspector.ping_server` | Initializes an allowlisted target MCP server and returns version/capabilities. |
| `inspector.list_capabilities` | Lists target tools, resources, and prompts. |
| `inspector.validate_tool_schema` | Validates basic target tool schema structure. |
| `inspector.invoke_tool_test` | Invokes a target tool with JSON arguments. Use for safe tools only. |
| `inspector.run_contract_tests` | Runs initialization, capability listing, schema, and optional safe invocation checks. |
| `inspector.generate_report` | Generates a diagnostic report. |
| `inspector.list_logs` | Lists recent in-memory inspector events. |

## Resources

| Resource | Description |
|---|---|
| `inspector://config` | Runtime configuration excluding secrets. |
| `inspector://logs/latest` | Recent inspection logs. |

## Prompts

| Prompt | Description |
|---|---|
| `inspector.fix_mcp_server` | Debugging workflow for repairing an MCP server. |
| `inspector.before_pr_review` | Checklist for reviewing MCP server changes before PR creation. |

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Check health:

```bash
curl http://localhost:8081/health
curl http://localhost:8081/ready
```

The MCP endpoint is:

```text
http://localhost:8081/mcp
```

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

## Build and test

```bash
npm run typecheck
npm test
npm run build
```

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `8081` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind host. |
| `LOG_LEVEL` | `info` | Pino log level. |
| `MCP_AUTH_TOKEN` | empty | Optional bearer token for this server. |
| `INSPECTOR_ALLOWED_TARGETS` | empty | Comma-separated exact MCP target URLs. |
| `INSPECTOR_TIMEOUT_MS` | `10000` | Target operation timeout. |
| `INSPECTOR_MAX_TOOL_RESULT_BYTES` | `262144` | Maximum serialized target tool result size. |
| `INSPECTOR_MAX_LOG_EVENTS` | `1000` | In-memory log ring size. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window. |
| `RATE_LIMIT_MAX` | `120` | Max requests per window. |

## Security model

This server must not inspect arbitrary network addresses. It only connects to URLs listed in `INSPECTOR_ALLOWED_TARGETS`.

Production recommendations:

- run behind Context Forge or an API gateway
- use bearer auth or upstream gateway auth
- keep target servers on an internal network
- inspect only non-production targets when invoking tools
- use `inspector.invoke_tool_test` only for read-only tools unless a human has approved mutation
- never place target secrets in prompts or reports

## Context Forge

The `context-forge/register.json` file registers this service as an upstream MCP server.

Example target endpoint:

```text
http://mcp-inspector-server:8081/mcp
```

## GitPilot usage

GitPilot should call this server through Context Forge, not directly.

Typical review flow:

1. `inspector.ping_server`
2. `inspector.list_capabilities`
3. `inspector.validate_tool_schema`
4. `inspector.run_contract_tests`
5. `inspector.generate_report`


---
Used by [GitPilot](https://github.com/ruslanmv/gitpilot)'s MCP Context Forge stack ([`docker-compose.mcp.yml`](https://github.com/ruslanmv/gitpilot/blob/main/docker-compose.mcp.yml)). Image published via `.github/workflows/docker-publish.yml` on each release.
