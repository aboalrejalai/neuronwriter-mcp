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

Existing data (good for read-only testing):
- Project `makkahdecorsa.com` → id `6ec9249b8de0a586` (1 query)
- Project `ديكورات` (9 queries)
- Query `ديكورات مكة` → `/analysis/view/c1f8fbd2b38960d3` (has a saved Arabic article)

## How NeuronWriter's web app works (what we build on)

- Server-rendered pages + **jQuery**. Every action is `$.post('/backend/<name>', JSON.stringify({...}))` on `https://app.neuronwriter.com`, authenticated by the session cookie. No CSRF meta tag was found.
- **99 internal endpoints** were found in `assets/js/scripts.js` and `assets/js/editor-t.js` → full list in [`docs/backend-endpoints.md`](docs/backend-endpoints.md).
- The analysis page carries its data in JS globals (`contadu_analysis_sig`, `content_terms`, `PROJECT_SIG`, …). Example seen in source:
  `save-optimized-content` body = `{ analysis: contadu_analysis_sig, content: { title, description, content: html, text, content_terms, custom_h1_terms, custom_h2_terms, … } }`.
- Public API (Gold+ only): `POST https://app.neuronwriter.com/neuron-api/0.5/writer/<method>` with header `X-API-KEY` → [`docs/api-v0.5.md`](docs/api-v0.5.md).
- Official remote MCP (Gold+ only): `https://app.neuronwriter.com/mcp/http`, OAuth sign-in, 12 tools. Our tool names mirror it with an `nw_` prefix.

## Architecture (summary — details in the plan)

```
MCP client ──stdio──► src/server.ts ─► src/tools/*.ts ─► Backend interface
                                                   ├─ SessionBackend (default): Playwright persistent profile,
                                                   │    fetch('/backend/<x>') run inside the page → cookies for free
                                                   └─ ApiBackend (Gold+): neuron-api/0.5 + X-API-KEY
```
- Login: `neuronwriter-mcp login` opens a visible browser; the **owner types the password himself**. Session lives in `~/.neuronwriter-mcp/profile/` (0700). Never ask for, log, or commit passwords or cookies.
- `NW_BACKEND=session|api|auto` (`auto` = api if `NEURONWRITER_API_KEY` is set, else session), `NW_PROFILE_DIR`, `NEURONWRITER_API_KEY` (only if the plan is ever upgraded).
- `src/cli.ts` has three subcommands: `serve` (default, stdio MCP), `login`, `status`.
- **One warm headless browser**: launched lazily on the first tool call, reused, closed after 10 min idle. Data not behind an endpoint (recommendations, competitors) is read from the analysis page's JS globals via `page.evaluate`, not by parsing HTML.
- **Both backends return the same shapes** — those of API v0.5 `get-query` / `list-queries` (`terms_txt`, `terms`, `ideas`, `metrics`, `competitors`; see `docs/api-v0.5.md`). Tools must not care which backend answered; tools the API lacks (AI, done marks, tags) throw `NotSupportedByBackend` on `ApiBackend`.
- `src/limiter.ts`: single-flight FIFO, ≥1.5 s gap for writes / 300 ms for reads, max 3 retries with backoff on 429/5xx.
- Error mapping in `SessionBackend`: login redirect / HTML login page → `SessionExpiredError` ("run: npx neuronwriter-mcp login"); plan-limit messages → `PlanLimitError` carrying NeuronWriter's text verbatim.
- Tools use `registerTool` with zod schemas, `annotations` (`readOnlyHint`/`destructiveHint`/…) and `structuredContent`. Credit-consuming tools say so in their description; `nw_create_query` dedupes identical keyword+engine+language within 30 min unless `force: true`.
- Fixtures: raw recordings from `scripts/recon.ts` go to `fixtures/raw/` (git-ignored); only redacted copies (no cookies, emails, signatures) go in `fixtures/`.

## Commands (once TASK-001 lands)

Node ≥ 22, TypeScript, ESM. No source exists yet — TASK-001 creates the scaffold.

- `npm run build` — tsc → `build/`
- `npm run dev` — run via tsx without building (e.g. `npx tsx src/cli.ts status`)
- `npm test` — vitest (fixture-based; never spends credits)
- Single test: `npx vitest run src/limiter.test.ts` or `npx vitest run -t "<test name>"`
- `npm run login` — one-time headed login
- `npm run status` — session + plan + limits
- `npx @modelcontextprotocol/inspector node build/cli.js` — try tools by hand
- Register: `claude mcp add --scope user neuronwriter -- node /Users/aboarejal/Desktop/Project/neuronwriter-mcp/build/cli.js`

## Hard rules

1. **Credits are scarce** (25 analyses/month). Tests use fixtures. Any live call to `new-analysis` / `generate-ai-*` needs the owner's OK in chat.
2. **Never call** `delete-project`, sharing/access (`add-analysis-access`, `revoke-analysis-access`, `update-share-analysis-link`), billing, survey, notifications, or `login` with stored credentials unless the owner set up Keychain auto-login.
3. **Human pacing:** one request at a time, ≥1.5 s between writes, backoff on 429/5xx. No bulk jobs. Never auto-solve captchas.
4. All `/backend/*` paths live in `src/backends/session/endpoints.ts` only.
5. Verify the current `@modelcontextprotocol/sdk` README before writing server code (v1.32.1 on 2026-10-12). Don't copy SDK 0.5 code from the reference repos.
6. stdout is the MCP protocol — log to stderr only.
7. Arabic content must round-trip byte-identical; test with the owner's Arabic project.
8. Keep MIT notices in `THIRD_PARTY_NOTICES.md` (we borrow API shapes/tool ideas from two MIT repos — see README).
9. Prefer Node built-ins (`fetch`, `parseArgs`, `--env-file`) over packages. Deps allowed: `@modelcontextprotocol/sdk`, `zod`, `playwright` (dev: `typescript`, `vitest`, `@types/node`, `tsx`). `node-html-parser` only if `page.evaluate` can't reach a value. No axios, no dotenv.
10. This file contains personal account data — **strip it before making the repo public**.

## Workflow

- Work on `main`, granular commits `type(scope): why`, one subject each.
- Keep a `CHANGELOG.md` (Keep a Changelog) and cut SemVer versions after finished batches, like the owner's main project.
- Reference clones (read-only): `~/.repos/softreviewed_neuronwriter-mcp-server` @ `9fe5f8a`, `~/.repos/antongulin_neuronwriter-api-skill` @ `c9ab509`.
