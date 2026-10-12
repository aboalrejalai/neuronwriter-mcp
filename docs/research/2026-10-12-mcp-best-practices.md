# MCP server best practices for neuronwriter-mcp

Deep-research run on 2026-10-12: 5 search angles, 25 sources fetched, 119 claims extracted, 25 verified by 3 adversarial voters each (21 confirmed, 4 refuted). Everything under **Verified** survived at least 2 of 3 votes against a primary source. Everything under **Not verified** is engineering judgement.

## Verified

### Errors
- Failures while a tool runs (bad input, NeuronWriter/API failure, quota used up, session expired) are returned as a normal result with `isError: true` and text that says what to do next. No bare error codes, no stack traces.
- JSON-RPC protocol errors are only for unknown tools, malformed requests and real server faults.
- Sources: [MCP spec 2025-11-25 · tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) (text unchanged in 2026-07-28), [Anthropic · Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [mcp-builder](https://github.com/anthropics/skills/tree/main/skills/mcp-builder).

### Structured output
- Every tool that returns structured data (projects, queries, terms, scores) declares an `outputSchema`.
- When a schema is declared, the server MUST return `structuredContent` that conforms to it, and SHOULD also return a text copy (JSON or a short summary). The SDK does not write the text copy for you.
- `McpServer.registerTool` validates `structuredContent` against `outputSchema` before sending. It skips the check for `isError` results.
- Sources: [MCP spec · tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [TS SDK · tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools), `@modelcontextprotocol/sdk` v1.x `src/server/mcp.ts`.

### Annotations
- Set all four on every tool: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. When omitted, the defaults are the unsafe values (`readOnly=false`, `destructive=true`, `idempotent=false`, `openWorld=true`).
- They are hints only. Clients must not trust them and the SDK never acts on them, so the server enforces its own safety.
- An annotation covers a whole tool, so reads and credit-spending writes must not share a tool.
- Sources: [TS SDK · tools](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools), [MCP spec · tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [Claude · define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).

### Server MUSTs (spec)
- Every server MUST:
  - validate all tool inputs
  - implement access controls
  - rate limit tool invocations
  - sanitize tool outputs
- Human confirmation of sensitive operations is only a SHOULD on clients, so the server cannot rely on it.
- Source: [MCP spec · tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

### SDK usage
- Use `McpServer` + `server.registerTool(name, {title, description, inputSchema, outputSchema, annotations}, handler)`.
- `server.tool()` is deprecated in 1.32.1.
- Write input schemas in Zod with `.strict()`, which mcp-builder recommends.
- **This repo still depends on `@modelcontextprotocol/sdk ^0.5.0`** (inherited from softreviewed), which uses the low-level `Server` + `setRequestHandler`. Upgrade to 1.32.1 before writing new server code. The existing tool schemas and request logic carry over; only the registration layer changes.

### Tool surface
- Build a few workflow-level tools, not one wrapper per `/backend/*` endpoint (there are 99).
- Group operations behind an `action` parameter only when they share the same safety profile.
- Names: `{service}_{action}_{resource}` in snake_case → `nw_list_projects`, `nw_get_analysis`. Use only `^[a-zA-Z0-9_-]{1,128}$` (Claude API rule, stricter than MCP).
- Descriptions are "by far the most important factor in tool performance". Each one gets 3–4+ sentences covering:
  - what the tool does
  - when to use it and when not to
  - what each parameter means
  - caveats (credit cost, monthly quota, Arabic/RTL content)
- Sources: [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [Claude · define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [mcp-builder](https://github.com/anthropics/skills/tree/main/skills/mcp-builder).

### Response size
- Return only what the next step needs, with stable IDs (NeuronWriter's hex project and query IDs).
- Paginate, filter or truncate by default. When output is cut, say how to ask more narrowly.
- Claude Code limits:
  - warning above 10k tokens
  - default cap 25k tokens (`MAX_MCP_OUTPUT_TOKENS`)
  - text results over 50,000 characters go to a file instead of inline; raise it per tool with `_meta['anthropic/maxResultSizeChars']`, up to 500,000
  - error text over ~11k characters is cut to its first and last 5k
- This matters most for full article HTML and long term lists.
- Sources: [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [Claude Code · MCP](https://code.claude.com/docs/en/mcp).

### Cancellation
- `notifications/cancelled` → the receiver SHOULD stop work, free resources and send no response.
- The SDK hands each handler an `AbortSignal` (`extra.signal`). Pass it into every Playwright wait, navigation, poll and in-page fetch.
- A write or credit-spending call that was already sent cannot be undone.
- Source: [MCP spec · cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).

### Transport and state
- A local server that uses the user's session: stdio first. Any later HTTP transport needs an auth token or restricted IPC.
- MCP is stateless as of 2026-07-28. Pass project and analysis IDs explicitly in arguments. A server-minted handle must be random and is never proof of authentication.
- Sources: [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices), [MCP 2026-07-28 · statelessness](https://modelcontextprotocol.io/specification/2026-07-28/basic/index).

## Refuted — do not design around

- All four claims about the **tasks** utility (experimental status, capability flags, the `tasks/get` polling lifecycle, `tasks/cancel`) were refuted 0–3 or 1–2. Use plain tool calls with progress and polling for analysis creation until this is checked against the current spec.

## Not verified (judgement, not standards)

No claim survived verification for these areas, so treat any rule here as the project's own decision:
- Playwright persistent-context reliability and session-expiry detection.
- Anti-ban pacing.
- Dedupe of credit-consuming calls.
- Fixture and contract testing of undocumented endpoints.
- MCP Inspector, eval suites, MCPB bundles, the official registry and versioning.
- Lessons from playwright-mcp, github-mcp-server and Chrome DevTools MCP.

Sources fetched but not verified, worth reading when those tasks start:
- [Playwright mock](https://playwright.dev/docs/mock)
- [Playwright APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext)
- [AWS · timeouts, retries, backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter)
- [Stripe · idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- [CyberArk · output poisoning](https://www.cyberark.com/resources/home/poison-everywhere-no-output-from-your-mcp-server-is-safe)
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- [github/github-mcp-server](https://github.com/github/github-mcp-server)
- [Chrome DevTools MCP design principles](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/HEAD/docs/design-principles.md)
- [MCP registry quickstart](https://modelcontextprotocol.io/registry/quickstart)
- [Inspector CLI smoke testing](https://github.com/modelcontextprotocol/inspector/blob/main/docs/cli-smoke-testing.md)

Open questions:
- How to detect an expired session reliably (redirect to /login, HTML instead of JSON, 401/403).
- What request rate NeuronWriter tolerates before throttling or flagging an account.
- Whether SDK 1.32.1 implements the 2026-07-28 spec.
- Which distribution fits best: npx from a private repo, an MCPB bundle, or a registry listing.

## Checklist to adopt

Items 1–7, 10 and 11 follow directly from verified findings. Items 8, 9 and 12 combine the spec's server MUSTs with this project's hard rules.

1. Upgrade `@modelcontextprotocol/sdk` to 1.32.1. Register tools with `registerTool` only.
2. Name tools `nw_{action}_{resource}`, using only `[a-z0-9_]`.
3. Every tool has a `title`, a 3–4+ sentence description (credit cost, when not to use), a `.strict()` Zod `inputSchema`, an `outputSchema`, and all four annotations set explicitly.
4. Read tools (`readOnlyHint: true`) are separate from credit-spending or write tools.
5. Build a few workflow tools, not 99 endpoint wrappers.
6. Return `structuredContent` plus a short text copy, with stable hex IDs and only the fields needed. Paginate or truncate by default, stay under ~50k characters, and say how to narrow.
7. Return every execution failure as `isError` with a next step, e.g. "session expired → run `npm run login`" or "quota 0/25 → resets on the 12th".
8. Enforce safety on the server:
   - an endpoint allow-list in `endpoints.ts`, with delete, share and billing endpoints hard-blocked
   - an explicit `confirm` argument on `new-analysis` and `generate-ai-*`
   - a serial queue with ≥1.5 s between writes and backoff on 429/5xx
   - a check for an existing analysis before spending credits
9. Sanitize and clearly delimit page-derived text before returning it, to limit prompt injection.
10. Pass `extra.signal` into every Playwright wait and fetch.
11. Use stdio only and log to stderr only. Cookies live only in the 0700 profile directory, passwords are never handled, and IDs are passed explicitly.
12. Test with recorded fixtures and the MCP Inspector before any live call.
