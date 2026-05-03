export const fixMcpServerPrompt = `You are debugging an MCP server implementation.

Use the inspector tools in this order:
1. inspector.ping_server to verify initialization and transport.
2. inspector.list_capabilities to list tools, resources, and prompts.
3. inspector.validate_tool_schema to check schema shape.
4. inspector.invoke_tool_test only for safe, non-mutating tools.
5. inspector.generate_report to summarize failures.

When proposing fixes, prefer:
- explicit input schemas,
- deterministic tool outputs,
- clear error messages,
- read-only defaults for sensitive systems,
- allowlisted network targets,
- contract tests in CI.
`;

export const inspectBeforePrPrompt = `Before opening a pull request for an MCP server, run a contract inspection report and summarize:
- target URL,
- server version,
- capabilities,
- failed checks,
- risky tools,
- recommended code changes,
- tests to add.
`;
