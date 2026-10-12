// stdout carries the MCP protocol, so every log line goes to stderr.
export function log(...args: unknown[]): void {
  console.error('[neuronwriter-mcp]', ...args);
}
