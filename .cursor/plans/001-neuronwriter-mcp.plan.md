---
goal: Build NeuronWriter MCP — a real MCP server that drives the owner's NeuronWriter account on the Bronze lifetime plan (no API), with a pluggable backend so the official API can be swapped in later
version: 1.0
date_created: 2026-10-12
last_updated: 2026-10-12
status: 'Planned'
tags: [feature, architecture, mcp, playwright, seo]
---

# Implementation Plan: NeuronWriter MCP

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

## Overview
**Current State:** Empty repo. The owner has a NeuronWriter **Bronze AppSumo lifetime** plan (1 code). The account's *Neuron API access* and *MCP Server* tabs both show "This feature requires at least Gold plan", so the official MCP (`https://app.neuronwriter.com/mcp/http`), the public API (`/neuron-api/0.5/writer`), every open-source MCP we found, and the Composio toolkit are all unusable today. The account has gone unused for ~12 months.

**Target State:** A local stdio MCP server (`neuronwriter-mcp`) that any MCP client (Claude Code, Claude Desktop, Cursor, Codex…) can use to list projects, create analyses, read recommendations, write and score content, run NeuronWriter's AI writer, and mark work done. It reuses the owner's logged-in browser session (persistent Playwright profile) and calls the same internal `/backend/*` JSON endpoints the web app calls. A second backend speaks the public API v0.5 so the same tools keep working if the plan is ever upgraded to Gold.

```
MCP client (Claude Code / Desktop / Cursor)
        │  stdio (JSON-RPC)
        ▼
src/server.ts ── tools/*.ts  (one tool surface, zod schemas, annotations)
        │
        ▼
src/backends/Backend.ts  (interface: listProjects, newQuery, getQuery, …)
   ├── SessionBackend  ← default (Bronze)   Playwright persistent profile
   │      └── page.evaluate(fetch('/backend/<x>', {method:'POST', body: JSON}))
   │          + HTML parsing for data embedded in pages (recommendations)
   └── ApiBackend      ← Gold+ only         POST https://app.neuronwriter.com/neuron-api/0.5/writer/<x>
                                             header X-API-KEY
```

## 1. Requirements & Constraints
- **REQ-001**: Works on the Bronze plan with no API key — session (cookie) based.
- **REQ-002**: Tool surface mirrors the official NeuronWriter MCP's 12 tools (names prefixed `nw_`) so switching to the official server later is painless.
- **REQ-003**: Login happens **once, by the owner, in a real visible browser window** (`neuronwriter-mcp login`). The server never asks for, logs, or stores the password in the repo. Optional auto re-login reads credentials from macOS Keychain only.
- **REQ-004**: Prefer internal `/backend/*` HTTP calls executed *inside* the page context (inherits cookies, same-origin, no CSRF token observed). Fall back to UI automation only where no endpoint exists.
- **REQ-005**: Credit-consuming tools (`nw_create_query`, `nw_generate_*`) are clearly marked (`annotations`, description text) and dedupe like the official server (same keyword+engine+language within 30 min → return existing unless `force: true`).
- **REQ-006**: Pluggable backend selected by `NW_BACKEND=session|api|auto` (`auto` = api if `NEURONWRITER_API_KEY` set, else session).
- **REQ-007**: Human-like pacing: serialize requests, min 1.5 s between write calls, exponential backoff on 429/5xx, no parallel bursts.
- **REQ-008**: Clear errors: logged-out session → `"Session expired — run: npx neuronwriter-mcp login"`; plan limit hit → surface NeuronWriter's message verbatim.
- **REQ-009**: Bilingual content: Arabic (RTL) keywords/content must round-trip unchanged (owner's projects are Arabic).
- **CON-001**: Node ≥ 22, TypeScript, ESM. Verify current `@modelcontextprotocol/sdk` API from its README before coding (was 1.32.1 on 2026-10-12; `softreviewed` used 0.5 — do not copy its old API).
- **CON-002**: Internal endpoints are undocumented and can change without notice — every endpoint shape lives in one file (`src/backends/session/endpoints.ts`) with recorded fixtures.
- **CON-003**: Never expose destructive account actions (`delete-project`, sharing/access revocation, billing).

## 2. Architecture & Alternatives
- **Session backend via in-page `fetch`** — the app is jQuery + `$.post('/backend/<x>', JSON.stringify({...}))`. Running `fetch` inside a page of the persistent context reuses cookies and headers exactly as the browser does, so we don't hand-manage cookies. Data that isn't behind an endpoint (term recommendations, competitor list) is read from the analysis page's embedded JS variables (`content_terms`, `contadu_analysis_sig`, …) via `page.evaluate`.
- **One headless browser, kept warm** — launched lazily on first tool call, reused, closed after 10 min idle.
- **stdio first.** Streamable HTTP (for remote use from the owner's portfolio app / phone) is a later, optional phase.
- **ALT-001**: *Raw HTTP with exported cookies (no browser).* Faster, but cookie refresh, any anti-bot checks and embedded-page data all break it. Kept as a possible optimisation for read-only calls after Phase 3 once fixtures prove the shapes.
- **ALT-002**: *Fork `softreviewed/neuronwriter-mcp-server`.* 207 lines, MCP SDK 0.5, API-key only — nothing to reuse for the session path. We reuse its *tool naming ideas* and the API shapes (MIT, credited in `THIRD_PARTY_NOTICES.md`).
- **ALT-003**: *Claude in Chrome / generic Playwright MCP.* Works but slow, Claude-only, and the model re-discovers the UI every time. Rejected by the owner.
- **ALT-004**: *Upgrade to Gold.* Cleanest path (official MCP), costs money; the `ApiBackend` keeps that door open.
- **ALT-005**: *WebMCP (`document.modelContext.registerTool`).* Only the site owner can register tools; not applicable.

## 2.1 No-Touch Zones
- `~/.neuronwriter-mcp/profile/` — the owner's live browser session. Code may read/use it; never commit, copy or upload it.
- `THIRD_PARTY_NOTICES.md` license texts — MIT requires keeping them; do not delete.
- The owner's NeuronWriter account settings, billing, sharing, and project deletion — never call those endpoints.

## 3. Dependencies & Files
- **DEP-001**: `@modelcontextprotocol/sdk` (latest 1.x — verify) — MCP server + stdio transport.
- **DEP-002**: `zod` — tool input schemas.
- **DEP-003**: `playwright` (Chromium) — persistent context. Use `channel: 'chrome'` if installed, else bundled Chromium.
- **DEP-004**: `node-html-parser` *only if* `page.evaluate` can't reach a value; prefer evaluate (no dep).
- **DEP-005** (dev): `typescript`, `vitest`, `@types/node`, `tsx`.
- Native: `fetch`, `node:util parseArgs`, `node:child_process` (`security find-generic-password` for Keychain). No axios, no dotenv (`node --env-file`).

| File Path | Change Type | Description / Dependencies |
|-----------|-------------|----------------------------|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | create | scaffold, `bin: neuronwriter-mcp` |
| `THIRD_PARTY_NOTICES.md` | create | MIT notices for softreviewed + antongulin |
| `scripts/recon.ts` | create | records real `/backend/*` request/response shapes into `fixtures/` (redacted) |
| `docs/backend-endpoints.md` | modify | fill in request/response shapes from recon |
| `src/cli.ts` | create | `login`, `status`, `serve` (default) subcommands |
| `src/session/browser.ts` | create | persistent context lifecycle, idle shutdown, login check |
| `src/session/keychain.ts` | create | optional credential read for auto re-login |
| `src/backends/Backend.ts` | create | backend interface + shared types |
| `src/backends/session/endpoints.ts` | create | every internal endpoint path + body builder in one place |
| `src/backends/session/SessionBackend.ts` | create | implements Backend over in-page fetch |
| `src/backends/api/ApiBackend.ts` | create | implements Backend over API v0.5 |
| `src/backends/select.ts` | create | `NW_BACKEND` resolution |
| `src/limiter.ts` | create | serial queue + pacing + backoff |
| `src/server.ts` | create | McpServer, registers tools |
| `src/tools/projects.ts`, `queries.ts`, `content.ts`, `ai.ts`, `account.ts` | create | tool definitions |
| `evals/neuronwriter.eval.xml` | create | 10 mcp-builder evaluation questions |
| `fixtures/*.json` | create | redacted recorded responses for unit tests |

## 4. Task Tracking & Phases

### Phase 1: Setup & Infrastructure
- **GOAL**: Buildable TS project and a recorded map of the real internal endpoints (highest risk first).
- [ ] TASK-001: Scaffold project (package.json, tsconfig, vitest, .gitignore, THIRD_PARTY_NOTICES)
- [ ] TASK-002: `login` command — persistent profile, owner logs in by hand, session check
- [ ] TASK-003: Recon script — capture request/response shapes of the core endpoints into fixtures + docs
- Checkpoint: `npm run build` clean; `npx tsx src/cli.ts status` reports "logged in as …"; `docs/backend-endpoints.md` has shapes for every endpoint used in Phases 3–5. **Review with owner before Phase 2.**

### Phase 2: Foundational
- **GOAL**: Backend interface, session client, MCP skeleton with one working tool.
- [ ] TASK-004: Backend interface + `endpoints.ts` + rate limiter
- [ ] TASK-005: SessionBackend core (`call(path, body)` via in-page fetch, logged-out detection, error mapping)
- [ ] TASK-006: MCP server skeleton (stdio) + `nw_status` tool (session, plan name, monthly limits from `/ucp/profile`)
- Checkpoint: Tests pass; `claude mcp add` → `nw_status` returns Bronze + 25/mo + 15000 AI credits.

### Phase 3: [US1] Read my SEO data
- **GOAL**: Agent can see projects, queries, recommendations, saved content.
- [ ] TASK-007 [US1]: `nw_list_projects`, `nw_list_queries` (filters: status, tags, keyword)
- [ ] TASK-008 [US1]: `nw_get_recommendations` (terms + ranges, headings terms, entities, questions, word-count/readability targets, competitors) from the analysis page
- [ ] TASK-009 [P] [US1]: `nw_get_content` (latest saved revision via `get-content-revision`)
- Checkpoint: For query `c1f8fbd2b38960d3` the agent returns the Arabic terms list and the saved article intact.

### Phase 4: [US2] Write & optimise
- **GOAL**: Agent can create an analysis, push content, score it, mark done.
- [ ] TASK-010 [US2]: `nw_create_query` (credit-consuming, dedupe, polls `analysis-status` until ready)
- [ ] TASK-011 [US2]: `nw_import_content` (save revision via `save-optimized-content`) + `nw_score_content` (score without saving)
- [ ] TASK-012 [P] [US2]: `nw_mark_done`, `nw_unmark_done`, `nw_update_tags`, `nw_create_project`
- Checkpoint: End-to-end: create query → write article with Claude → import → score ≥ target → mark done, visible in the web UI.

### Phase 5: [US3] NeuronWriter AI (the part the public API doesn't have)
- **GOAL**: Use the 15,000 monthly AI credits from the agent.
- [ ] TASK-013 [US3]: `nw_generate_outline` (`generate-ai-outline`), `nw_generate_content` (`generate-ai-content`), `nw_check_readability`
- Checkpoint: outline + one section generated for a test query; credit usage reflected in `nw_status`.

### Phase 6: [US4] Gold-ready API backend
- **GOAL**: Same tools over the public API when a key exists.
- [ ] TASK-014 [US4]: `ApiBackend` (API v0.5) + `NW_BACKEND` selection; tools not in the API return a clear "session backend only" error
- Checkpoint: Contract tests run against both backends with fixtures.

### Phase 7: Ship
- [ ] TASK-015: Evals (10 questions per mcp-builder), README usage, register in Claude Code/Desktop, CHANGELOG `0.1.0`
- Checkpoint: Owner runs one real article end-to-end from Claude Code.

## 5. Detailed Task Definitions

### TASK-001: Scaffold project
**Description:** Create an ESM TypeScript project with `bin` entry `neuronwriter-mcp` → `build/cli.js`, scripts `build`, `dev` (tsx), `test` (vitest), `login`, `status`. `.gitignore` must exclude `node_modules/`, `build/`, `.env*`, `fixtures/raw/`, `*.har`. Add `THIRD_PARTY_NOTICES.md` with the MIT text for `softreviewed/neuronwriter-mcp-server` (commit 9fe5f8a) and `antongulin/neuronwriter-api-skill` (commit c9ab509) — clones live read-only in `~/.repos/`.

**Acceptance criteria:**
- [ ] `npm install && npm run build` succeeds on Node 22+
- [ ] `node build/cli.js --help` prints the subcommands
- [ ] Notices file contains both MIT copyright lines

**Verification:**
- [ ] Tests pass: `npm test` (empty suite OK)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `git status` shows no profile/env files tracked

**Dependencies:** None
**Files likely touched:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `THIRD_PARTY_NOTICES.md`
**Estimated scope:** Small

### TASK-002: `login` command and persistent session
**Description:** `neuronwriter-mcp login` launches a **headed** Playwright persistent context at `${NW_PROFILE_DIR:-~/.neuronwriter-mcp/profile}` on `https://app.neuronwriter.com/`, waits until the URL is no longer a login page and the dashboard renders (`My projects`), then closes. `status` launches headless with the same profile and reports logged-in email + plan from `/ucp/profile`. The owner types the password himself (or uses Google sign-in); nothing is written except the browser profile.

**Acceptance criteria:**
- [ ] After `login`, `status` prints `aboalrejal.ai@gmail.com · Neuron-Bronze-AppSumo`
- [ ] With an empty profile, `status` exits non-zero with the "run login" message
- [ ] Profile dir has `0700` permissions

**Verification:**
- [ ] Tests pass: `npm test` (unit test for the "is logged in" page detector with saved HTML)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: owner runs `npm run login` once

**Dependencies:** TASK-001
**Files likely touched:** `src/cli.ts`, `src/session/browser.ts`
**Estimated scope:** Small

### TASK-003: Recon — record real endpoint shapes
**Description:** `scripts/recon.ts` opens the profile headed, attaches `page.on('request'|'response')` for `/backend/*`, and lets the owner (or the agent, read-only) click through: dashboard → project → existing query `c1f8fbd2b38960d3` → editor. It writes request bodies and responses to `fixtures/raw/` (git-ignored), then a redacted copy to `fixtures/` and a shape summary into `docs/backend-endpoints.md`. Redact cookies, emails, signatures. **Do not** trigger credit-consuming endpoints during recon except one deliberate `new-analysis` the owner approves (costs 1 of 25). Also dump the analysis page's embedded globals (`contadu_analysis_sig`, `content_terms`, headings terms, competitors) to learn where recommendations live.

**Acceptance criteria:**
- [ ] Shapes recorded for: `get-recent-analyses`, `analysis-status`, `get-content-revision`, `save-optimized-content`, `check-readability`, `mark-content-as-done`, `new-analysis`, `new-project`, `generate-ai-outline`, `generate-ai-content`
- [ ] Location of recommendations data documented (endpoint or page global)
- [ ] How projects/queries lists are delivered documented (HTML table vs endpoint)

**Verification:**
- [ ] Manual check: `docs/backend-endpoints.md` has a request + response example per endpoint, no secrets (`grep -i cookie fixtures/*.json` empty)

**Dependencies:** TASK-002
**Files likely touched:** `scripts/recon.ts`, `docs/backend-endpoints.md`, `fixtures/*.json`
**Estimated scope:** Medium

### TASK-004: Backend interface, endpoints map, limiter
**Description:** Define `Backend` (methods matching the tool list, typed results) and shared types (`Project`, `QuerySummary`, `Recommendations`, `ContentRevision`, `Score`). `endpoints.ts` holds every `/backend/*` path and a body builder per call, built from TASK-003 fixtures. `limiter.ts`: single-flight FIFO queue, min gap 1.5 s for writes / 300 ms for reads, retry with backoff on 429/5xx (max 3).

**Acceptance criteria:**
- [ ] No endpoint string appears outside `endpoints.ts`
- [ ] Limiter unit tests: ordering, spacing, retry

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

**Dependencies:** TASK-003
**Files likely touched:** `src/backends/Backend.ts`, `src/backends/session/endpoints.ts`, `src/limiter.ts`, `src/limiter.test.ts`
**Estimated scope:** Medium

### TASK-005: SessionBackend core
**Description:** `call(path, body)` runs `fetch(path, {method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, body: JSON.stringify(body)})` inside a warm page on `app.neuronwriter.com` (match what `$.post` actually sends — confirm from recon), parses JSON, and maps failures: redirect/HTML login page → `SessionExpiredError`; plan-limit messages → `PlanLimitError` with the original text. Optional auto re-login via Keychain (`security find-generic-password -s neuronwriter-mcp -w`) only if the owner created that item. Browser closes after 10 min idle.

**Acceptance criteria:**
- [ ] Unit tests with fixtures for success, expired session, limit error
- [ ] Arabic strings round-trip byte-identical

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: `status` still works after 11 min idle (relaunch)

**Dependencies:** TASK-004
**Files likely touched:** `src/backends/session/SessionBackend.ts`, `src/session/browser.ts`, `src/session/keychain.ts`, tests
**Estimated scope:** Medium

### TASK-006: MCP server skeleton + `nw_status`
**Description:** Read the current MCP TypeScript SDK README first. `serve` (default subcommand) starts `McpServer` on stdio, registers tools via `registerTool` with zod input schemas, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and `structuredContent`. `nw_status` returns backend in use, logged-in email, plan name, monthly limits/usage, reset date (parsed from `/ucp/profile`).

**Acceptance criteria:**
- [ ] `npx @modelcontextprotocol/inspector node build/cli.js` lists `nw_status` and it returns real values
- [ ] Logs go to stderr only (stdout is protocol)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `claude mcp add neuronwriter -- node <abs>/build/cli.js` then ask Claude "what's my NeuronWriter usage?"

**Dependencies:** TASK-005
**Files likely touched:** `src/server.ts`, `src/cli.ts`, `src/tools/account.ts`
**Estimated scope:** Small

### TASK-007: `nw_list_projects`, `nw_list_queries`
**Description:** Projects from the dashboard (endpoint or parsed `My projects` list — per recon), returning `{id, name, language, engine, queryCount}`. Queries for a project (from `/project/view/<id>/optimisation` data or `get-recent-analyses`), filterable by `status`, `tags`, `keyword`, returning `{id, keyword, status, score, tags, created, url}`.

**Acceptance criteria:**
- [ ] Returns the owner's 2 projects (`makkahdecorsa.com` = `6ec9249b8de0a586`, `ديكورات`)
- [ ] Query list includes `c1f8fbd2b38960d3` with its Arabic keyword

**Verification:**
- [ ] Tests pass: `npm test` (fixture-based)
- [ ] Manual check via Inspector

**Dependencies:** TASK-006
**Files likely touched:** `src/tools/projects.ts`, `src/tools/queries.ts`, `SessionBackend.ts`
**Estimated scope:** Medium

### TASK-008: `nw_get_recommendations`
**Description:** Load `/analysis/view/<id>` and extract via `page.evaluate`: basic/extended content terms with suggested usage ranges, title/H1/H2 terms, entities, questions (suggested / PAA / competitor), word-count and readability targets, competitor list (rank, url, title, score). Output shape mirrors API v0.5 `get-query` (`terms_txt`, `terms`, `ideas`, `metrics`, `competitors`) so both backends return the same thing. Must not consume credits.

**Acceptance criteria:**
- [ ] Same top-level keys as API v0.5 `get-query`
- [ ] Usage on `nw_status` unchanged after calling it

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: compare 5 terms with what the editor sidebar shows

**Dependencies:** TASK-006
**Files likely touched:** `src/tools/queries.ts`, `SessionBackend.ts`, `fixtures/analysis-page.json`
**Estimated scope:** Medium

### TASK-009: `nw_get_content`
**Description:** Latest saved revision via `/backend/get-content-revision` → `{title, description, html, created}`; `revision: 'manual'|'all'`.

**Acceptance criteria:**
- [ ] Returns the saved Arabic article for `c1f8fbd2b38960d3` intact

**Verification:**
- [ ] Tests pass: `npm test`

**Dependencies:** TASK-006
**Files likely touched:** `src/tools/content.ts`, `SessionBackend.ts`
**Estimated scope:** Small

### TASK-010: `nw_create_query`
**Description:** Inputs: `project`, `keyword`, `language`, `engine` (default `google.com.sa` for Arabic projects — confirm option values from recon), `competitors_mode`, `additional_keywords`, `force`. Dedupe against queries created in the last 30 min. Calls `new-analysis`, then polls `analysis-status` (every 5 s, max 3 min). Description states it uses 1 of 25 monthly analyses. Returns id + URLs.

**Acceptance criteria:**
- [ ] Second identical call within 30 min returns the first id without spending a credit
- [ ] Limit exhausted → `PlanLimitError` text returned to the agent

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check (owner-approved, costs 1 credit): one real query reaches `ready`

**Dependencies:** TASK-007
**Files likely touched:** `src/tools/queries.ts`, `SessionBackend.ts`
**Estimated scope:** Medium

### TASK-011: `nw_import_content` + `nw_score_content`
**Description:** `nw_import_content` saves `{title, description, html}` as a new revision via `save-optimized-content` (body shape: `{analysis: <analysis sig>, content: {title, description, content: html, text, content_terms, custom_h1_terms, custom_h2_terms, …}}` — the term arrays come from the page's globals, so this call runs on the analysis page). Optional `url` import via `auto-import-content`. `nw_score_content` computes the score without saving (find the editor's scoring path in recon; if scoring is client-side JS, call it via `page.evaluate` against the page's own function).

**Acceptance criteria:**
- [ ] Imported content visible in the web editor after reload
- [ ] Score from `nw_score_content` matches the editor's displayed score ±1

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check in web UI

**Dependencies:** TASK-008, TASK-009
**Files likely touched:** `src/tools/content.ts`, `SessionBackend.ts`, `endpoints.ts`
**Estimated scope:** Medium

### TASK-012: Done marks, tags, create project
**Description:** `nw_mark_done` / `nw_unmark_done` (`mark-content-as-done` / `unmark-content-as-done`), `nw_update_tags`, `nw_create_project` (`new-project`; warns that Bronze has 2 project slots and both are used — call `check-project-limit` first).

**Acceptance criteria:**
- [ ] Done mark toggles visibly in project view
- [ ] `nw_create_project` on a full plan returns the limit message without side effects

**Verification:**
- [ ] Tests pass: `npm test`

**Dependencies:** TASK-007
**Files likely touched:** `src/tools/queries.ts`, `src/tools/projects.ts`, `SessionBackend.ts`
**Estimated scope:** Small

### TASK-013: AI tools
**Description:** `nw_generate_outline` (`generate-ai-outline`), `nw_generate_content` (`generate-ai-content`, section or full; template/temperature params from recon), `nw_check_readability`. Descriptions state AI-credit cost. These are the tools the public API lacks.

**Acceptance criteria:**
- [ ] Outline generated for a test query; AI credit usage increases in `nw_status`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check in web UI

**Dependencies:** TASK-011
**Files likely touched:** `src/tools/ai.ts`, `SessionBackend.ts`, `endpoints.ts`
**Estimated scope:** Medium

### TASK-014: ApiBackend (Gold-ready)
**Description:** Implement `Backend` over `POST https://app.neuronwriter.com/neuron-api/0.5/writer/{list-projects,new-query,get-query,list-queries,get-content,import-content,evaluate-content}` with `X-API-KEY` (reference: `docs/api-v0.5.md`). `select.ts` picks backend from `NW_BACKEND`. AI/done/tags tools throw `NotSupportedByBackend`. Contract tests run the same fixture-driven expectations against both backends.

**Acceptance criteria:**
- [ ] `NW_BACKEND=api` without a key → clear startup error
- [ ] Contract tests green for both backends

**Verification:**
- [ ] Tests pass: `npm test`

**Dependencies:** TASK-011
**Files likely touched:** `src/backends/api/ApiBackend.ts`, `src/backends/select.ts`, tests
**Estimated scope:** Medium

### TASK-015: Evals, docs, registration, release
**Description:** Write 10 read-only evaluation questions (mcp-builder format) answerable from the owner's data; README usage section; register with Claude Code (`claude mcp add --scope user neuronwriter -- node <abs>/build/cli.js`) and Claude Desktop; `CHANGELOG.md` `0.1.0`.

**Acceptance criteria:**
- [ ] Evals run and ≥ 8/10 answered correctly
- [ ] Owner completes one real article from Claude Code

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

**Dependencies:** TASK-013
**Files likely touched:** `evals/neuronwriter.eval.xml`, `README.md`, `CHANGELOG.md`
**Estimated scope:** Small

## 6. Risks and Assumptions
| ID | Risk / Assumption | Impact | Mitigation / Note |
|----|-------------------|--------|-------------------|
| RISK-001 | Terms of Service may forbid automated access; lifetime account could be suspended | High | Personal use only, human pacing (REQ-007), no scraping of competitors beyond what the app shows, no bulk jobs. Owner reads ToS (the /terms-of-service URL returned 404 on 2026-10-12 — find the real one) and accepts the risk |
| RISK-002 | Internal `/backend/*` endpoints change without notice | Med | All paths in `endpoints.ts`, fixtures + contract tests, `nw_status` health check surfaces breakage fast |
| RISK-003 | Session expires / Cloudflare or captcha challenge on headless | Med | Detect and tell the agent to run `login`; never solve captchas automatically |
| RISK-004 | Recommendations only exist as page globals, not JSON | Med | `page.evaluate` extraction; fixture of the page globals |
| RISK-005 | Only 25 analyses/month — tests burn credits | Med | Fixtures for tests; live credit-consuming runs only with owner approval |
| ASM-001 | No CSRF token is required (`csrfMeta: false` observed) | - | Confirm in TASK-003 |
| ASM-002 | Requests are jQuery `$.post` with a JSON string body | - | Seen in `save-optimized-content` source; confirm headers in recon |
| ASM-003 | 99 `/backend/*` paths exist (list in `docs/backend-endpoints.md`) | - | Captured 2026-10-12 from `scripts.js` / `editor-t.js` |

## 7. Open Questions
- Does the owner want auto re-login from Keychain, or always manual `login`?
- Later: expose over Streamable HTTP so the portfolio app / phone can use it? (needs auth in front of it)
- Publish as open source later? If yes, strip personal data from `CLAUDE.md` first.

## 8. Rollback Plan
- The server is local and opt-in: remove it with `claude mcp remove neuronwriter`, delete `~/.neuronwriter-mcp/` to drop the session. No changes are made to the NeuronWriter account other than the queries/content the owner asked for.
