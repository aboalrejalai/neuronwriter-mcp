# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Canonical agent instructions for this repo. `AGENTS.md` is a symlink to this file — edit here only.

**Active plan:** [`.claude/plans/001-neuronwriter-mcp.plan.md`](.claude/plans/001-neuronwriter-mcp.plan.md) (real file in `.cursor/plans/`, symlinked into `.claude/plans/` and `.agents/plans/`).
When the owner says **"اشتغل"** / "start": open the plan, find the first unchecked `TASK-xxx`, implement it, verify it per its *Verification* block, tick it in the plan, commit, continue. Stop at every **Checkpoint** and report to the owner before the next phase.

## What this project is

**NeuronWriter MCP** — a local MCP server that lets any AI agent (Claude Code, Claude Desktop, Cursor, Codex…) drive the owner's NeuronWriter account: list projects, create content analyses, read SEO recommendations, write/import/score content, use NeuronWriter's AI writer, mark work done.

Why it exists: the owner bought NeuronWriter as an AppSumo lifetime deal and hasn't used it for ~12 months because doing SEO writing by hand in the web UI isn't how he works anymore. The official MCP and API are locked to Gold+, so we build our own that works through his logged-in session.

## The owner

- Mohammed (aboalrejal). Speaks Saudi Arabic — reply in Arabic, keep technical terms/commands in English.
- Claude Max 20 plan. Uses Claude Code as the main agent; also Cursor/Codex.
- Main other project: `~/Desktop/Project/aboalrejal` (portfolio + AI workspace, React/Supabase). Uses **Composio** for third-party integrations there.
- Wants a sustainable tool, not a slow chat-driven browser (Claude in Chrome was rejected as the solution: slow, Claude-only).

## NeuronWriter account facts (verified 2026-10-12 in the owner's browser)

| Item | Value |
|---|---|
| Login email | `aboalrejal.ai@gmail.com` |
| Plan | **Neuron-Bronze-AppSumo**, valid for lifetime (1 AppSumo code, redeemed) |
| Content Writer analyses | 25 / month |
| AI credits | 15,000 / month |
| Projects | 2 / 2 used (no free slot) |
| Monitored prompts (AI Visibility) | 0 / 5 |
| Monthly reset | the 12th, 17:30 UTC |
| Neuron API access | **locked** — "This feature requires at least Gold plan" |
| MCP Server (official) | **locked** — Gold+ |
| Upgrade path | Profile → Subscription → "Upgrade lifetime access to a higher plan" (Gold = 3 AppSumo codes; AppSumo listing currently sold out) |

Existing data (good for read-only testing; verified 2026-10-12):
- Project `makkahdecorsa.com` → id `6ec9249b8de0a586`, holds query `ديكورات مكة` → `/analysis/view/c1f8fbd2b38960d3` (saved Arabic article, 409 words, score 9, target 1034 words)
- Project `ديكورات` → id `21132423440d01e0`

## How NeuronWriter's web app works (what we build on)

- Server-rendered pages + **jQuery**. Every action is `$.post('/backend/<name>', JSON.stringify({...}))` on `https://app.neuronwriter.com`, authenticated by the session cookie. No CSRF meta tag was found.
- **99 internal endpoints** were found in `assets/js/scripts.js` and `assets/js/editor-t.js` → full list in [`docs/backend-endpoints.md`](docs/backend-endpoints.md).
- The analysis page carries its data in JS globals (`contadu_analysis_sig`, `content_terms`, `PROJECT_SIG`, …). Example seen in source:
  `save-optimized-content` body = `{ analysis: contadu_analysis_sig, content: { title, description, content: html, text, content_terms, custom_h1_terms, custom_h2_terms, … } }`.
- Public API (Gold+ only): `POST https://app.neuronwriter.com/neuron-api/0.5/writer/<method>` with header `X-API-KEY` → [`docs/api/api-docs.md`](docs/api/api-docs.md).
- Official remote MCP (Gold+ only): `https://app.neuronwriter.com/mcp/http`, OAuth sign-in, 12 tools. Our tool names mirror it with an `nw_` prefix.

## Architecture

```
MCP client ──stdio──► src/index.ts (serve | login | status) ─► src/server.ts ─► src/tools/*.ts ─► Backend (src/backends/Backend.ts)
                                                                                   ├─ SessionBackend (default, Bronze): Playwright persistent profile
                                                                                   └─ ApiBackend (Gold+): neuron-api/0.5 + X-API-KEY (imported softreviewed code)
```
- Base code was imported, not rewritten: softreviewed's API client lives on in `src/backends/api/ApiBackend.ts`, antongulin's skill in `skills/neuronwriter-api/`. Build on them; don't replace them.
- **10 tools**, `nw_{action}_{resource}`: reads `nw_status`, `nw_list_projects`, `nw_list_queries`, `nw_get_recommendations`, `nw_get_content`, `nw_score_content`; writes `nw_import_content`, `nw_set_done`; credit-spending `nw_create_query`, `nw_generate_outline`. Rules every tool follows (from [`docs/research/2026-10-12-mcp-best-practices.md`](docs/research/2026-10-12-mcp-best-practices.md)): `registerTool` only, `z.strictObject` input, `outputSchema` + `structuredContent` + text copy (`ok()` in `tools/shared.ts`), all four annotations set, 3–4+ sentence description, failures as `isError` with a "Next step" (`handle()` + `NwError.hint`), reads never share a tool with writes, large lists paged or capped.
- Credit-spending tools refuse without `confirm: true` (`ConfirmationRequiredError`); `nw_create_query` first returns an existing analysis with the same keyword unless `force: true`.
- **Both backends return the same shapes** (`Recommendations`, `QuerySummary`, `Score`… in `Backend.ts`). API-only gaps throw `NotSupportedError`.
- **SessionBackend** (`src/backends/session/`):
  - `browser.ts` — one headless persistent context on `NW_PROFILE_DIR` (default `~/.neuronwriter-mcp/profile`, 0700), lazy, closed after 10 min idle. It aborts images/fonts/CSS and **every `/backend/` request without our `x-nw-mcp` header**, so the editor page can never autosave or poll on its own.
  - `pageScripts.ts` — functions run inside the page with `page.evaluate`; must stay self-contained. Recommendations come from the page's own functions (`get_must_have_terms(true,'json')` …), not reimplemented.
  - `normalize.ts` — pure mapping + `interpretResponse` (HTML/login redirect → `SessionExpiredError`, 429/5xx → `RetryableError`, `{error}` → `PlanLimitError`/`NeuronWriterError`). Tested with `test/fixtures/`.
  - Request shapes and what is still unknown: [`docs/backend-endpoints.md`](docs/backend-endpoints.md).
- `src/limiter.ts`: single FIFO queue, 300 ms before reads / 1.5 s before writes, backoff with jitter on 429/5xx. **Writes are never retried** (a retried `new-analysis` would spend twice).
- Login: `npm run login` opens a visible browser; the **owner types the password himself**. Never ask for, log, or commit passwords or cookies.
- `NW_BACKEND=session|api|auto` (`auto` = api if `NEURONWRITER_API_KEY`/`NW_API_KEY` is set, else session).

## Commands

Node ≥ 22, TypeScript (NodeNext ESM).

- `npm run build` — tsc → `build/`
- `npm test` — vitest, fixtures only (never touches the account)
- Single test: `npx vitest run test/limiter.test.ts` or `npx vitest run -t "<test name>"`
- `npm run typecheck`
- `npm run login` — one-time headed sign-in (owner only)
- `npm run status` — session, plan, usage, reset date
- `npx tsx src/index.ts status` — same without building
- `npm run inspector` — MCP Inspector on `build/index.js`
- Register: `claude mcp add --scope user neuronwriter -- node /Users/aboarejal/Desktop/Project/neuronwriter-mcp/build/index.js`

## Hard rules

1. **Credits are scarce** (25 analyses/month). Tests use fixtures. Any live call to `new-analysis` / `generate-ai-*` needs the owner's OK in chat.
2. **Never call** anything in `FORBIDDEN_ENDPOINTS` (`endpoints.ts`): `delete-project`, sharing/access, billing, survey, notifications, `login`.
3. **Human pacing:** one request at a time through `Limiter`, no bulk jobs, never auto-solve captchas.
4. All `/backend/*` paths live in `src/backends/session/endpoints.ts` only.
5. Follow the checklist in `docs/research/2026-10-12-mcp-best-practices.md` for every new tool; `server.tool()` and the low-level `Server` API are deprecated.
6. stdout is the MCP protocol — log to stderr only (`src/log.ts`).
7. Arabic content must round-trip byte-identical (the owner's own content is never sanitized; only third-party text goes through `sanitizeExternalText`).
8. Keep MIT notices in `THIRD_PARTY_NOTICES.md`.
9. Runtime deps: `@modelcontextprotocol/sdk`, `zod`, `playwright`, `axios` (kept from the imported API client). Prefer Node built-ins for anything new.
10. This file contains personal account data — **strip it before making the repo public**.

## Workflow

- Work on `main`, granular commits `type(scope): why`, one subject each.
- Keep a `CHANGELOG.md` (Keep a Changelog) and cut SemVer versions after finished batches, like the owner's main project.
- Upstream sources (already imported, read-only): `~/.repos/softreviewed_neuronwriter-mcp-server` @ `9fe5f8a`, `~/.repos/antongulin_neuronwriter-api-skill` @ `c9ab509`.
