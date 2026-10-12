---
goal: Cover 100% of what the Bronze plan can do in NeuronWriter through the MCP — every capability marked 🟡 in docs/capability-map.md — with every tool tried live on the owner's account
version: 1.0
date_created: 2026-10-13
last_updated: 2026-10-13
status: 'Planned'
tags: [feature, architecture, mcp, playwright, seo, ai]
---

# Implementation Plan: Full Bronze-plan coverage

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

## Overview
**Current State:** v0.3.0 — 17 tools, all tried live. They cover the core loop: analysis → recommendations → write → score → save → done, plus settings, tags, competitors, content plan (list/add), page fetch, and AI outline and meta. `docs/capability-map.md` lists about 30 capabilities the plan allows that are still missing (🟡). Among them:
- Per-term usage.
- Custom terms and exclusions.
- Analysis targets.
- The rest of the AI templates.
- Plagiarism.
- Export.
- Comments.
- Internal links.
- Revisions.
- Calendar and tasks.
- Inventory.
- AI Visibility.
- WordPress.
- Create project.
- Metric refresh.
- Two robustness gaps: one process at a time, and editor conflicts.

**Target State:** v1.0.0 — every 🟡 row in the capability map is ✅ (built and tried live), within the Bronze plan.
- The only exclusions are the deliberate ones (§1 NON-GOALS).
- The tool surface stays coherent at about 34 tools. Tools are grouped by safety profile, not one tool per endpoint.
- Several MCP clients can share the session safely.
- The AI-credit budget for verification stays well inside one month's 15,000.

## 1. Requirements & Constraints
- **REQ-001**: Every capability in `docs/capability-map.md` marked 🟡, plus the AI kinds not yet tried, becomes a tool that is tried live on the owner's account before it is ticked. "Built" without a live run does not count (owner's rule, 2026-10-13).
- **REQ-002**: Before any code, each area's request body is re-checked against the live app's JS, read-only, by probe. Shapes recorded during the 2026-10-13 crawl are the starting point, not the truth (RISK-002).
- **REQ-003**: Tool-design rules from `docs/research/2026-10-12-mcp-best-practices.md`:
  - `registerTool` only, with strict input, output schema, `structuredContent` plus a text copy, and all four annotations.
  - Descriptions of 3–4+ sentences.
  - `isError` results that carry a next step.
  - Reads never share a tool with writes; credit-spending or external writes get their own tools and require `confirm: true`.
- **REQ-004**: Group capabilities that share a safety profile behind one tool with an `action`/`part` enum. Target is about 34 tools in total (§2, ALT-002).
- **REQ-005**: Full-replace endpoints are always read first and written back whole. These are `update-project-settings`, `update-tags-status`, and any list-style save found during probes.
- **REQ-006**: Live verification reverts every change it makes unless the owner keeps it on purpose. Each live script logs what it spent.
- **REQ-007**: Credit budget for this plan's verification: **≤ 4 Content Writer analyses and ≤ 6,000 AI credits in the cycle that ends 2026-11-12**. Heavy kinds (facts ~5,000, full Content Designer article, auto-insert ~2,000) are verified only after the owner approves each one in chat, or after the reset (§7).
- **REQ-008**: Two or more MCP processes (several Claude/Cursor sessions) must not crash on the shared browser profile. They wait or report clearly.
- **REQ-009**: Saving content must not silently overwrite an article the owner is editing in the web app at the same moment.
- **REQ-010**: Arabic round-trips byte-identical. Third-party text (competitors, WordPress posts, AI Visibility answers) is sanitized and labelled as data.
- **CON-001**: Passwords and credentials are never typed or accepted by tools. The WordPress application password is entered by the owner in the web UI; tools use what is saved.
- **CON-002**: Nothing that sends e-mail or messages on the owner's behalf.
- **CON-003**: Runtime deps stay `@modelcontextprotocol/sdk`, `zod`, `playwright`, `axios`. Exports use `node:fs`.
- **NON-GOALS** (deliberate, accepted by the owner on 2026-10-13):
  - Deleting a project or the account (the owner deletes projects himself).
  - Sharing or access invitations.
  - Profile, e-mail, 2FA, API key, billing.
  - Topics (not in the plan).
  - Custom report logo (Agency+).
  - `export-table` (it only re-formats rows the client already has).
  - `analysis-report-term` (feedback to the vendor).

## 2. Architecture & Alternatives

```
src/backends/
  Backend.ts            core contract — only what BOTH backends do (list, recommendations, content, score, import, create query)
  session/
    SessionCore.ts      browser + limiter + open()/post()/postForm() + editor-conflict guard   (from today's SessionBackend)
    SessionBackend.ts   implements Backend + exposes `features` (below)
    features/           one module per area, each a set of functions over SessionCore:
      analysis.ts       terms, targets, revisions, comments, internal links, delete, refresh, plagiarism, export
      ai.ts             every generate-ai-content kind, AI score, facts, images, custom templates, AI-profile extract
      planning.ts       content plan, calendar/tasks, inventory, lookups
      projects.ts       settings (moved), create project
      visibility.ts     ai-tracker/*
      wordpress.ts      integration/wp-*
    pageScripts/        split by area the same way (each function still self-contained)
  api/ApiBackend.ts     loses its 8 NotSupported stubs: session-only tools ask `requireSession(backend)`
```

- **Session-only features hang off `SessionBackend.features`, not the shared `Backend` interface.** Tools call `requireSession(backend)`, which throws `NotSupportedError` on the api backend. This deletes today's stub methods from `ApiBackend` and keeps the contract honest.
- **Tool surface (≈34)** — grouped by safety profile:
  - **Reads (12):**
    - `nw_status`, `nw_list_projects`, `nw_get_project_settings`.
    - `nw_get_project_data` (`part`: content_plan | tasks | inventory | ai_visibility).
    - `nw_list_queries`, `nw_get_recommendations`.
    - `nw_get_content` (+ `revision`).
    - `nw_get_analysis_details` (`part`: revisions | comments | internal_links | content_ideas | activity).
    - `nw_score_content` (+ per-term usage), `nw_fetch_page`.
    - `nw_lookup` (`action`: locations | url_keywords | suggest_target_url | hub_pages).
    - `nw_wordpress` (`action`: test | posts | post).
  - **Free writes (15):**
    - `nw_create_project`, `nw_update_project_settings`.
    - `nw_update_content_plan` (replaces `nw_add_content_plan_idea`; `action`: add | delete | assign | deadline).
    - `nw_save_task`, `nw_update_inventory`, `nw_update_ai_visibility`.
    - `nw_update_analysis` (targets, target URL, person, deadline, distribution).
    - `nw_update_terms`, `nw_select_competitors`, `nw_import_content`, `nw_set_done`, `nw_update_tags`.
    - `nw_update_comments`, `nw_update_internal_links`, `nw_manage_ai_templates`.
  - **Destructive (1):** `nw_delete_query` (soft delete).
  - **Credits or external (5):**
    - `nw_create_query`.
    - `nw_generate_ai`: all AI kinds, both analysis-scoped and project-scoped.
    - `nw_check_plagiarism`, `nw_refresh_metrics`, `nw_publish_wordpress`.
  - **Local file (1):** `nw_export_content`.
  - `nw_list_content_plan` folds into `nw_get_project_data`.
- **Per-term usage reuses the app's own counting**, not a re-implementation. Candidates are `matched_forms_info` from `check-readability`, the editor's term-usage function, or `highlight-terms`; TASK-005 decides by probe.
- **Profile sharing across processes:**
  - On a profile-lock launch error, retry with backoff for up to 60 s.
  - Shorten idle close from 10 to 3 minutes.
  - Then fail with "another NeuronWriter MCP session is busy — retry in a minute".
- **Editor-conflict guard:**
  - Before `save-optimized-content`, call `analysis-status`. If `recently_active` shows another active editor session in the last 5 minutes, refuse with a next step.
  - The agent may pass `force: true` after asking the owner.
- **Files out:** exports and AI images are written to `NW_EXPORT_DIR` (default `~/Downloads/neuronwriter-mcp/`). The tool returns the path, never a multi-megabyte base64 in the result.
- **ALT-001**: *Keep growing the shared `Backend` interface with NotSupported stubs on the API side.* Rejected: about 40 stub methods, and the contract lies about what the API can do.
- **ALT-002**: *One tool per endpoint (~70 tools).* Rejected by the research: selection ambiguity, and annotations become meaningless when a tool mixes reads and writes.
- **ALT-003**: *A long-lived daemon that owns the browser, with MCP processes talking to it over a local socket.* It solves multi-client sharing completely, but it adds a process to supervise and a socket to lock down. Deferred; the lock-retry above covers the owner's real use (one or two sessions). Revisit if RISK-006 materializes.
- **ALT-004**: *Expose the raw 36 AI templates as-is.* Rejected: the agent would have to know every `template_params` field. Instead, `kind` names map to templates and the server fills the fields from the analysis, as the app's autofill does.

## 2.1 No-Touch Zones
- `~/.neuronwriter-mcp/profile/` — the owner's live session. Used, never copied, uploaded, or committed.
- `THIRD_PARTY_NOTICES.md` license texts.
- `FORBIDDEN_ENDPOINTS` in `src/backends/session/endpoints.ts` — the list may only grow.
- `docs/research/2026-10-12-mcp-best-practices.md` — the record of the research; add new research as new files.

## 3. Dependencies & Files
- **DEP-001**: No new runtime dependency. Probes and live scripts use the installed `playwright` and `@modelcontextprotocol/sdk` client.
- **DEP-002**: Probe dumps go to the session scratchpad or `fixtures/raw/` (git-ignored). Only redacted fixtures are committed.

| File Path | Change Type | Description / Dependencies |
|-----------|-------------|----------------------------|
| `src/backends/Backend.ts` | modify | shrink to the core contract; add `SessionFeatures` types |
| `src/backends/session/SessionCore.ts` | create | open/post/postForm, lock-retry, conflict guard (from SessionBackend) |
| `src/backends/session/SessionBackend.ts` | modify | thin: core methods + `features` |
| `src/backends/session/features/*.ts` | create | analysis, ai, planning, projects, visibility, wordpress |
| `src/backends/session/pageScripts/*.ts` | create (split) | from today's single `pageScripts.ts` |
| `src/backends/session/endpoints.ts` | modify | every new path, kind, `spendsCredits` |
| `src/backends/session/browser.ts` | modify | lock-retry, idle 3 min |
| `src/backends/api/ApiBackend.ts` | modify | delete NotSupported stubs |
| `src/tools/*.ts` | create/modify | the ≈34 tools of §2; `requireSession()` in `shared.ts` |
| `src/files.ts` | create | safe writes into `NW_EXPORT_DIR` |
| `scripts/probe.mjs` | create | generic read-only probe: open a page, evaluate, dump JSON to a path |
| `scripts/live/*.mjs` | create | live verification per phase, with revert and spend log |
| `test/**` | create/modify | fixtures and tests per task |
| `docs/capability-map.md`, `docs/backend-endpoints.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` | modify | after each phase |
| `evals/neuronwriter.eval.xml` | create | 10 read-only eval questions (carried over from plan 001, TASK-015) |

## 4. Task Tracking & Phases

### Phase 1: Foundations
- **GOAL**: An architecture that can hold ~34 tools, safe for several clients, with tooling to probe and verify live.
- [ ] TASK-001: Split SessionBackend into SessionCore + feature modules; `requireSession()`; delete ApiBackend stubs (no behaviour change)
- [ ] TASK-002 [P]: `scripts/probe.mjs` + `scripts/live/` harness (revert discipline, spend log)
- [ ] TASK-003: Profile lock-retry across processes + 3-minute idle close
- [ ] TASK-004: Editor-conflict guard on saves (`analysis-status`)
- Checkpoint: 45+ tests pass, build clean, `scripts/smoke-live.mjs` unchanged output, two MCP processes run reads concurrently without a crash. **Review with owner.**

### Phase 2: [US1] Write content that wins
- **GOAL**: Every lever the editor has over an analysis.
- [ ] TASK-005 [US1]: Per-term usage in `nw_score_content` / `nw_fetch_page` (app's own counting)
- [ ] TASK-006 [US1]: `nw_update_terms` — custom terms, ranges, exclude/re-include, negative filter
- [ ] TASK-007 [US1]: `nw_update_analysis` — word-count/readability targets, target URL, person, deadline, distribution
- [ ] TASK-008 [US1]: `nw_create_query` options (custom competitors, target URL, city) + `nw_lookup` locations
- [ ] TASK-009 [P] [US1]: Revisions — `nw_get_content` `revision` + `nw_get_analysis_details` part `revisions`
- Checkpoint: live run on the test analysis `6677c6ba75b413e6`; all changes reverted; ≤1 analysis spent.

### Phase 3: [US2] All of NeuronWriter's AI
- **GOAL**: Every AI action on the plan, budgeted.
- [ ] TASK-010 [US2]: Try live and fix the 6 untried kinds (intro, paragraph, faq, rephrase, expand, article)
- [ ] TASK-011 [US2]: Remaining templates as kinds (titles, product/category description, reviews, content-plan/topical-map keywords, YouTube, email, synonyms) + free prompt (`ai-selection`)
- [ ] TASK-012 [US2]: Kinds `insert_terms`, `ai_score`, `facts` (owner approves each heavy run)
- [ ] TASK-013 [US2]: Content Designer full article (meta → outline → facts → article), one call or guided steps
- [ ] TASK-014 [P] [US2]: AI images (ideas + image saved to `NW_EXPORT_DIR`)
- [ ] TASK-015 [P] [US2]: `nw_manage_ai_templates` (list/save/delete) + kind `custom`
- [ ] TASK-016 [P] [US2]: Project-scoped kind `ai_profile` (extract-ai-overview) → optional save via settings
- Checkpoint: every kind ran once live; spend log ≤ budget (REQ-007); outputs land in Arabic.

### Phase 4: [US3] Analysis extras
- **GOAL**: Quality control, collaboration, housekeeping.
- [ ] TASK-017 [P] [US3]: `nw_check_plagiarism`
- [ ] TASK-018 [P] [US3]: `nw_export_content` (docx and other formats the app offers) to a file
- [ ] TASK-019 [US3]: Comments — read part + `nw_update_comments`
- [ ] TASK-020 [US3]: Internal links — read part, `nw_update_internal_links`, AI kind `internal_links`
- [ ] TASK-021 [P] [US3]: `nw_delete_query` (soft) + restore via tags
- [ ] TASK-022 [P] [US3]: `nw_refresh_metrics` (Moz, search volume)
- Checkpoint: live run; test comments/links/deletes reverted.

### Phase 5: [US4] Planning
- **GOAL**: Content plan, calendar, inventory and lookups.
- [ ] TASK-023 [US4]: `nw_update_content_plan` (add/delete/assign/deadline) + `nw_get_project_data` part `content_plan` + part `content_ideas` (get-nar-ideas → add-to-content-plan)
- [ ] TASK-024 [US4]: Calendar and tasks — part `tasks` (form-encoded `get-content-calendar-events`, `get-inventory-task`) + `nw_save_task`
- [ ] TASK-025 [US4]: Inventory recon + part `inventory`
- [ ] TASK-026 [US4]: `nw_update_inventory` (add keywords/URLs, edit, delete, target URL/keyword, pillar/satellite, parent)
- [ ] TASK-027 [P] [US4]: `nw_lookup` url_keywords, suggest_target_url, hub_pages
- Checkpoint: live run on the ديكورات project; test rows deleted afterwards.

### Phase 6: [US5] Projects
- **GOAL**: Create a project once the owner frees a slot.
- [ ] TASK-028 [US5]: `nw_create_project` (check-project-limit → new-project-domain → new-project), then settings

### Phase 7: [US6] AI Visibility
- **GOAL**: The 5 monitored prompts and every AI Visibility action, on the domain project.
- [ ] TASK-029 [US6]: part `ai_visibility` (init status, monitored prompts, details)
- [ ] TASK-030 [US6]: `nw_update_ai_visibility` (brands, add/delete prompts, opportunity status) + AI kinds suggest_brands, suggest_prompts
- [ ] TASK-031 [US6]: AI kinds readiness_audit, earn_mention (+ regenerate)
- Checkpoint: one prompt monitored then removed, unless the owner keeps it.

### Phase 8: [US7] WordPress
- **GOAL**: Pull and publish articles once the owner saved WordPress credentials in the UI.
- [ ] TASK-032 [US7]: `nw_wordpress` test / posts / post
- [ ] TASK-033 [US7]: Import a WordPress post into an analysis (wp-get-post → nw_import_content)
- [ ] TASK-034 [US7]: `nw_publish_wordpress` (draft by default; status/type explicit; confirm)

### Phase 9: Ship
- [ ] TASK-035: Tool-surface review (count, names, descriptions, annotations), Inspector pass, evals (≥ 8/10)
- [ ] TASK-036: Capability map all ✅, README/CLAUDE/CHANGELOG, v1.0.0 tag
- Checkpoint: owner runs one real article end-to-end on a live project using only the MCP.

## 5. Detailed Task Definitions

### TASK-001: Split SessionBackend into SessionCore and feature modules
**Description:** Move `open`, `openAnalysis` and `post` out of `SessionBackend` into `SessionCore`, and add `postForm` for form-encoded endpoints. Move today's session-only methods into `features/{analysis,ai,planning,projects}.ts`: generateAi, setTags, selectCompetitors, fetchPage, content plan, settings. Split `pageScripts.ts` the same way. Shrink `Backend` to the core contract. Add `requireSession(backend)` in `tools/shared.ts` and use it in session-only tools. Delete the 8 NotSupported stubs from `ApiBackend`. No behaviour change.

**Acceptance criteria:**
- [ ] `ApiBackend` has no NotSupported methods; session-only tools on `NW_BACKEND=api` return the NotSupported `isError`
- [ ] No file in `src/backends/session/` exceeds ~350 lines
- [ ] Tool list and outputs are unchanged (same 17 tools)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `node scripts/smoke-live.mjs` prints the same results as before

**Dependencies:** None
**Files likely touched:** `src/backends/Backend.ts`, `src/backends/session/SessionCore.ts`, `src/backends/session/SessionBackend.ts`, `src/backends/session/features/*.ts`, `src/backends/api/ApiBackend.ts`
**Estimated scope:** Large (mechanical move; split into two commits: core, then features)

### TASK-002: Probe and live-verification harness
**Description:** Add `scripts/probe.mjs <path> <expression-file> <out.json>`. It opens a page with the same route blocking as `browser.ts`, evaluates a function file, and writes the result to the output path; it is read-only. Add a `scripts/live/` helper: an MCP stdio client, a `step()` logger, a spend log taken from `nw_status` before and after, and a `revert()` stack that runs in `finally`. Each later phase adds one `scripts/live/<phase>.mjs`.

**Acceptance criteria:**
- [ ] Probe refuses non-GET navigation and never posts
- [ ] A live script prints analyses/AI credits spent and runs reverts even when a step fails

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: probe dumps `first_h2_ideas` length for `c1f8fbd2b38960d3`; a dummy live script's revert runs after a forced failure

**Dependencies:** None
**Files likely touched:** `scripts/probe.mjs`, `scripts/live/harness.mjs`, `.gitignore`
**Estimated scope:** Small

### TASK-003: Share the profile across MCP processes
**Description:** When `launchPersistentContext` fails because the profile is locked by another process (Chromium's `SingletonLock`), retry with backoff for up to 60 s, then raise `NwError('Another NeuronWriter MCP session is using the browser', 'Retry in a minute or close the other session')`. Shorten idle close to 3 minutes so locks are released sooner.

**Acceptance criteria:**
- [ ] Two servers started together both answer `nw_list_projects`; the second waits instead of crashing
- [ ] With the lock held longer than 60 s the second gets the actionable error

**Verification:**
- [ ] Tests pass: `npm test` (lock detection on a fake launcher)
- [ ] Manual check: two `scripts/smoke-live.mjs` runs in parallel both complete

**Dependencies:** TASK-001
**Files likely touched:** `src/backends/session/browser.ts`, `test/browser.test.ts`
**Estimated scope:** Small

### TASK-004: Editor-conflict guard
**Description:** Before `save-optimized-content` (in `nw_import_content` and any later content write), post `analysis-status {analysis}`. Probe its `recently_active` shape first. If another session edited within the last 5 minutes, return an `isError` whose next step is "ask the owner to close the editor or pass force: true". Add `force` to `nw_import_content`.

**Acceptance criteria:**
- [ ] Import is refused while the owner has the analysis open in the web editor, and allowed with `force: true`
- [ ] No false refusal when nobody has it open

**Verification:**
- [ ] Tests pass: `npm test` (fixtures for active and inactive responses)
- [ ] Manual check: owner opens `6677c6ba75b413e6` in Chrome; import is refused; close it; import succeeds

**Dependencies:** TASK-001, TASK-002
**Files likely touched:** `src/backends/session/SessionCore.ts`, `src/tools/content.ts`, `test/fixtures/analysis-status-*.json`
**Estimated scope:** Small

### TASK-005: Per-term usage in scores
**Description:** Probe what the editor uses to show "used X / min–max" per term. Candidates, in order of preference:
1. Fields in the `check-readability` response (`matched_forms_info`, `subscore_details`).
2. The editor's own counting function (`page.evaluate` against the scored HTML).
3. `highlight-terms`.

Return `terms: [{term, section: body|title|h1|h2|description, uses, min, max, status: missing|under|ok|over}]` from `nw_score_content` and `nw_fetch_page`. Cap the list and sort missing/under first.

**Acceptance criteria:**
- [ ] For the saved article of `c1f8fbd2b38960d3`, five terms match what the editor sidebar shows (±0)
- [ ] Output stays under ~20k characters with the defaults

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: compare with the editor sidebar in Chrome

**Dependencies:** TASK-001, TASK-002
**Files likely touched:** `src/backends/session/features/analysis.ts`, `src/backends/session/pageScripts/analysis.ts`, `src/tools/content.ts`, `test/…`
**Estimated scope:** Medium

### TASK-006: `nw_update_terms`
**Description:** One write tool with `action`:
- `add` (`terms[]`, `location` text|h1|h2) → `analysis-add-custom-term`
- `remove` → `analysis-delete-custom-term`
- `set_range` (`term`, `min`, `max`) / `reset_range` → `analysis-update-custom-term-params`
- `exclude` / `reinclude` → `analysis-exclude-term`
- `negative_filter` (`on|off`) → `analysis-update-exclusion-settings`

Confirm `from_contadu` semantics by probe. Return the updated term lists by re-reading the analysis.

**Acceptance criteria:**
- [ ] Each action shows its effect in a following `nw_get_recommendations` and is reverted by its inverse
- [ ] Unknown term → actionable error listing close matches

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: `scripts/live/phase2.mjs` on `6677c6ba75b413e6`, all reverted

**Dependencies:** TASK-001, TASK-002
**Files likely touched:** `features/analysis.ts`, `endpoints.ts`, `src/tools/terms.ts`, tests
**Estimated scope:** Medium

### TASK-007: `nw_update_analysis`
**Description:** Probe `update_target_value` callers to get the `target_name` values for `analysis-update-targets`. Then expose:
- `target_word_count`, `target_readability` → `analysis-update-targets`
- `target_url` → `update-target-url`
- `assigned_to`, `deadline` → `update-analysis-management-info`
- `distribution` → `update-analysis-distribution`

Read the current values first and return the values after saving.

**Acceptance criteria:**
- [ ] Changing the word-count target changes `targets.word_count` in `nw_get_recommendations`; restored afterwards
- [ ] Deadline accepts `YYYY-MM-DD` only

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live script, reverted

**Dependencies:** TASK-001, TASK-002
**Files likely touched:** `features/analysis.ts`, `endpoints.ts`, `src/tools/analysis.ts`, tests
**Estimated scope:** Medium

### TASK-008: Create-query options and locations
**Description:** Extend `nw_create_query` with:
- `custom_competitors` (≤5 URLs).
- `target_url`.
- `city`, resolved through `nw_lookup action:locations` (GET `get-geolocation-list?q=&engine=`). Ambiguous names return the candidates.

Handle `update_status: 'ask'` (target-URL collision) as an actionable error carrying the colliding keyword. Do not auto-force.

**Acceptance criteria:**
- [ ] One live analysis with a city and one custom competitor is created (spends 1; owner-approved) and shows them in the editor
- [ ] Collision returns the question instead of overwriting

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, 1 analysis

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `features/planning.ts` (lookup), `src/tools/queries.ts`, `src/tools/lookup.ts`
**Estimated scope:** Medium

### TASK-009: Revisions
**Description:** `nw_get_analysis_details part: revisions` lists `optimize_content_revisions` as `[{revision, saved_at, autosave}]`. `nw_get_content` accepts an optional `revision` to read a specific one; the default stays the newest manual one.

**Acceptance criteria:**
- [ ] Lists ≥3 revisions for `c1f8fbd2b38960d3` and reads an older one byte-identical

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live read

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `src/tools/content.ts`, `src/tools/analysisDetails.ts`
**Estimated scope:** Small

### TASK-010: Verify the untried AI kinds
**Description:** Run `intro`, `paragraph`, `faq`, `rephrase`, `expand` and `article` once each on `6677c6ba75b413e6` with small `word_count`. Fix any body differences against the editor's template form, found by probe. Record the per-kind credit use in the capability map.

**Acceptance criteria:**
- [ ] All 6 return Arabic content with `status: ok`
- [ ] Spend ≤ 1,500 AI credits for the six

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: `scripts/live/phase3.mjs` spend log

**Dependencies:** TASK-001, TASK-002
**Files likely touched:** `features/ai.ts`, `pageScripts/ai.ts`, `docs/capability-map.md`
**Estimated scope:** Small

### TASK-011: Remaining template kinds and free prompt
**Description:** Add kinds:
- `titles` (article-titles)
- `product_description`, `category_description`
- `product_reviews`
- `content_plan_keywords`, `topical_map`
- `youtube_description`, `email`
- `synonyms` (term-synonyms)
- `prompt`: `ai-selection` mode, a free instruction applied to optional `text`

Map each template's fields from `ai_templates_definition`, with autofill like the app's. Add inputs `keywords`, `product_name`, `category_name`, `bullet_points` and `video_title` where a template needs them, validated per kind.

**Acceptance criteria:**
- [ ] Each kind validates its required inputs before spending
- [ ] Each runs once live (small outputs) and returns Arabic text

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: spend log ≤ 1,500 AI credits

**Dependencies:** TASK-010
**Files likely touched:** `features/ai.ts`, `pageScripts/ai.ts`, `src/tools/ai.ts`, tests
**Estimated scope:** Medium

### TASK-012: Insert terms, AI score, facts
**Description:** Add three kinds:
- `insert_terms`: `autoinsert-terms`. Input is `html`; output is the new HTML. Nothing is saved.
- `ai_score`: `check-readability-ai`. Output is `ai_overall_score` and the details as text.
- `facts`: `extract-facts`. Input is competitor URLs and/or custom sources; output is the facts.

The description states the typical cost (~2,000 and ~5,000 credits). Each run needs the owner's explicit approval in chat at verification time.

**Acceptance criteria:**
- [ ] `insert_terms` raises the score of a weak test draft (scored before and after)
- [ ] `facts` runs only after owner approval, or after the 2026-11-12 reset

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, approved runs only

**Dependencies:** TASK-010, TASK-005
**Files likely touched:** `features/ai.ts`, `endpoints.ts`, `src/tools/ai.ts`
**Estimated scope:** Medium

### TASK-013: Content Designer full article
**Description:** Kind `designer_article` reproduces the wizard:
1. `save-content-brief-cd` (brief).
2. Meta.
3. Outline.
4. Optional facts.
5. `content-designer-blog-article`, or `content-designer-landing-page` with `content_type`.

Inputs: `content_requirements`, `tone`, `word_count`, `use_facts`. It returns all stage outputs, and it may return after each stage when `step` is given, so the agent can review the outline before the expensive article.

**Acceptance criteria:**
- [ ] A full Arabic article for the test analysis that scores ≥ the editor's result for the same inputs
- [ ] Stage mode stops after the outline without spending on the article

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: owner-approved run, spend logged

**Dependencies:** TASK-011, TASK-012
**Files likely touched:** `features/ai.ts`, `pageScripts/ai.ts`, `src/tools/ai.ts`
**Estimated scope:** Medium

### TASK-014: AI images
**Description:**
- Kind `image_ideas` (`generate-ai-image-ideas`): needs `title` and the surrounding text/heading.
- Kind `image` (`generate-ai-image`): needs `idea`, `ratio` (3:2|1:1|2:3) and `style` (photograph|cartoon|painting|sketch). The base64 `<img>` is decoded to a PNG/JPEG in `NW_EXPORT_DIR`, and the tool returns the path.

**Acceptance criteria:**
- [ ] One image file written and openable; result contains a path, not base64

**Verification:**
- [ ] Tests pass: `npm test` (file writer with a tiny base64 fixture)
- [ ] Manual check: open the file

**Dependencies:** TASK-010
**Files likely touched:** `features/ai.ts`, `src/files.ts`, `src/tools/ai.ts`
**Estimated scope:** Small

### TASK-015: Custom AI templates
**Description:** `nw_manage_ai_templates` with actions:
- `list` (from `custom_ai_templates_definition`)
- `save` (name, prompt, system role, notes, fields) → `save-custom-ai-template`
- `delete` → `delete-custom-ai-template`

Add kind `custom` (`template_sig`, variables) to `nw_generate_ai`. Probe `template-preview` mode, which shows the final prompt for free.

**Acceptance criteria:**
- [ ] Save → appears in list → run once → delete; nothing left behind

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-011
**Files likely touched:** `features/ai.ts`, `src/tools/aiTemplates.ts`, `src/tools/ai.ts`
**Estimated scope:** Small

### TASK-016: AI Profile extraction
**Description:** Project-scoped kind `ai_profile` (`extract-ai-overview {project, urls ≤3}`) returns the five texts. `nw_generate_ai` accepts `project` instead of `query` for project-scoped kinds, validated per kind. Saving stays a separate, explicit `nw_update_project_settings` call.

**Acceptance criteria:**
- [ ] Extract from `https://makkahdecorsa.com` returns five Arabic texts; nothing saved until the second call

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, owner decides whether to save

**Dependencies:** TASK-010
**Files likely touched:** `features/ai.ts`, `src/tools/ai.ts`
**Estimated scope:** Small

### TASK-017: Plagiarism check
**Description:** `nw_check_plagiarism {query, html?, title?, description?}` posts `check-for-plagiarism`; the default is the saved article. Returns unique %, matched sentences, sources and the details URL. Probe whether it spends plagiarism credits and say so in the description. Requires `confirm`.

**Acceptance criteria:**
- [ ] One live check on the saved article of `c1f8fbd2b38960d3`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: result matches the editor's plagiarism panel

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `src/tools/quality.ts`
**Estimated scope:** Small

### TASK-018: Export to file
**Description:** `nw_export_content {query, format, revision?}` → `export-content-as`. Read the formats from the app's export menu by probe. Decode `download_data` into `NW_EXPORT_DIR/<keyword>-<date>.<ext>` and return the path and size.

**Acceptance criteria:**
- [ ] A DOCX of the Arabic article opens with correct RTL text

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: open the DOCX

**Dependencies:** TASK-001, TASK-009
**Files likely touched:** `features/analysis.ts`, `src/files.ts`, `src/tools/export.ts`
**Estimated scope:** Small

### TASK-019: Comments
**Description:** Read part `comments` from the editor DOM (probe the markup): id, text, author, resolved, parent. `nw_update_comments` actions:
- `add` (with optional `parent_id` for replies)
- `edit`
- `resolve`
- `delete` (`update-comment-status`)

**Acceptance criteria:**
- [ ] add → reply → edit → resolve → delete on the test analysis; the list reflects each step

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, left clean

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `pageScripts/analysis.ts`, `src/tools/comments.ts`
**Estimated scope:** Medium

### TASK-020: Internal links
**Description:**
- Read part `internal_links`: `get-internal-links-suggestions`, with the HTML rows parsed into `{id, url, anchor, status, note}`.
- `nw_update_internal_links` sets status (TODO/In progress/Done) and adds notes.
- AI kind `internal_links` (`get-ai-internal-links-suggestions`) returns the suggestions and the new HTML, unsaved.

**Acceptance criteria:**
- [ ] Classic suggestions listed for an analysis of the domain project; a status set and cleared

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `src/tools/links.ts`, `src/tools/ai.ts`
**Estimated scope:** Medium

### TASK-021: Soft delete and restore
**Description:** `nw_delete_query {project, query, confirm}` → `delete-analysis`. Restore is `nw_update_tags remove: ["Deleted"]`; confirm by probe that it truly restores. Destructive annotation; the description says it is restorable.

**Acceptance criteria:**
- [ ] Delete hides the test analysis from the active list; restore brings it back

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, restored

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `src/tools/queries.ts`
**Estimated scope:** Small

### TASK-022: Refresh metrics
**Description:** `nw_refresh_metrics {query, what: moz|volume}`:
- `moz` → `request-moz-update {analysis}`
- `volume` → `request-volume-update {targeting: "<lang>|<engine>"}`

Probe the cost; require `confirm` until it is known to be free.

**Acceptance criteria:**
- [ ] Volume refresh accepted and reflected within ~5 minutes in `nw_list_queries`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-001
**Files likely touched:** `features/analysis.ts`, `src/tools/metrics.ts`
**Estimated scope:** Small

### TASK-023: Content plan, complete
**Description:** `nw_update_content_plan` actions:
- `add`
- `delete` (`delete-from-content-plan`)
- `assign` / `deadline` (`update-cp-management-info`)
- `add_from_ideas` (the `idea_config` from `get-nar-ideas` HTML; probe its shape)

`nw_get_project_data part: content_plan` replaces `nw_list_content_plan`. `nw_get_analysis_details part: content_ideas` → `get-nar-ideas`. Remove `nw_list_content_plan` and `nw_add_content_plan_idea`.

**Acceptance criteria:**
- [ ] Add → assign → deadline → delete a test idea; "بديل الرخام مكة" untouched
- [ ] Ideas from an analysis listed and one added to the plan

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-001
**Files likely touched:** `features/planning.ts`, `pageScripts/planning.ts`, `src/tools/planning.ts`, `src/tools/projects.ts`
**Estimated scope:** Medium

### TASK-024: Calendar and tasks
**Description:**
- Part `tasks`: `get-content-calendar-events` (form-encoded `project, filter_t_status, filter_t_assigned_to, start, end`) for a date range, plus `get-inventory-task` for details.
- `nw_save_task` creates or updates a task through `create-update-inventory-task`, with every field read first on update.

**Acceptance criteria:**
- [ ] A test task created for next week appears in the calendar part, is updated, then set to Deleted

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: visible in the Content management calendar

**Dependencies:** TASK-001 (postForm)
**Files likely touched:** `features/planning.ts`, `src/tools/planning.ts`
**Estimated scope:** Medium

### TASK-025: Inventory recon and read
**Description:** Find where the inventory tables live, since no dumped page rendered `#inventory_keywords_table`: a tab, a lazy endpoint, or the content plan page. Then implement part `inventory`: keywords with target URL and status, and URLs with page type, parent and target keyword, paged.

**Acceptance criteria:**
- [ ] Inventory of the ديكورات project listed (or "empty", proven by the page)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: matches the web UI

**Dependencies:** TASK-002
**Files likely touched:** `features/planning.ts`, `pageScripts/planning.ts`, `src/tools/projects.ts`
**Estimated scope:** Medium

### TASK-026: Inventory writes
**Description:** `nw_update_inventory` actions:
- `add_keywords`, `add_urls`
- `edit`, `delete`
- `set_target_url`, `set_target_keyword` (handle `ask` collisions)
- `set_page_type`, `set_parent` (send the correct `url_md5`; the app's own call has a bug here)

**Acceptance criteria:**
- [ ] Add a test keyword and URL, link them, mark the URL a satellite of a pillar, then delete both

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, left clean

**Dependencies:** TASK-025
**Files likely touched:** `features/planning.ts`, `src/tools/planning.ts`
**Estimated scope:** Medium

### TASK-027: Lookups
**Description:** `nw_lookup` actions:
- `url_keywords` (`get-url-top-keywords`; needs Search Console — say so when absent)
- `suggest_target_url` (`suggest-target-url-for-keyword`)
- `hub_pages` (`get-hub-pages`)
- `locations` (from TASK-008)

HTML tables are parsed to rows.

**Acceptance criteria:**
- [ ] Each action returns rows or an actionable "not connected/empty" message

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-008, TASK-025
**Files likely touched:** `features/planning.ts`, `src/tools/lookup.ts`
**Estimated scope:** Small

### TASK-028: Create project
**Description:** `nw_create_project {mode: domain|nondomain, homepage_or_name, engine, language, keywords[]}`. It calls `check-project-limit` first, then `new-project-domain` to get the suggested engine and language, then `new-project`. It returns the new id and reads its settings. The response is an array (`['success', id]`). It runs only after the owner frees a slot; until then it must return the limit message without side effects.

**Acceptance criteria:**
- [ ] At 2/2: returns the plan-limit error, nothing created
- [ ] After the owner deletes a project: creates one, visible in `nw_list_projects`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live after the owner's deletion

**Dependencies:** TASK-001
**Files likely touched:** `features/projects.ts`, `src/tools/projects.ts`
**Estimated scope:** Small

### TASK-029: AI Visibility read
**Description:** Part `ai_visibility` on a domain project returns initialization status, brands, monitored prompts (with sig, engine, mention/visibility data as rendered) and slots used/available. `prompt` returns details (`get-monitored-prompt-details`, views overview|earn-mention), with the HTML parsed to text. Non-domain projects get an actionable message.

**Acceptance criteria:**
- [ ] makkahdecorsa.com returns 0/5 prompts and its brand settings; ديكورات returns the domain-only message

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: matches the AI Visibility page

**Dependencies:** TASK-002
**Files likely touched:** `features/visibility.ts`, `pageScripts/visibility.ts`, `src/tools/projects.ts`
**Estimated scope:** Medium

### TASK-030: AI Visibility setup
**Description:** `nw_update_ai_visibility` actions:
- `set_brands` (≤10) → `save-ai-tracker-project-settings`
- `add_prompts` (counts against 5 slots; say so) → `add-prompts-to-monitoring`
- `delete_prompt`
- `opportunity_status`

AI kinds `suggest_brands` and `suggest_prompts` (url, type) are project-scoped.

**Acceptance criteria:**
- [ ] Suggest → add 1 prompt → initialization progresses → delete (unless the owner keeps it)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-029, TASK-016
**Files likely touched:** `features/visibility.ts`, `src/tools/visibility.ts`, `src/tools/ai.ts`
**Estimated scope:** Medium

### TASK-031: AI Visibility audits
**Description:** AI kinds:
- `readiness_audit` (`analyze-ai-readiness {project, url}`)
- `earn_mention` (`analyze-url-for-brand-mentions`)
- `earn_mention_rewrite` (`regenerate-brand-mention-content`)

Each output is parsed from HTML to text.

**Acceptance criteria:**
- [ ] One readiness audit of makkahdecorsa.com returned as readable text

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live, spend logged

**Dependencies:** TASK-030
**Files likely touched:** `features/visibility.ts`, `src/tools/ai.ts`
**Estimated scope:** Small

### TASK-032: WordPress read
**Description:** `nw_wordpress` actions:
- `test` → `integration/wp-test`, using saved credentials read from the settings DOM and never returned
- `availability`
- `posts` (search, mode)
- `post` (by id/type → title + HTML)

When no credentials are saved, the next step is "save the WordPress user and application password in Project settings → Integrations".

**Acceptance criteria:**
- [ ] Without credentials: actionable message; with the owner's saved credentials: connection test `ok` and a posts list

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live after the owner saves credentials

**Dependencies:** TASK-001; owner saves WP credentials
**Files likely touched:** `features/wordpress.ts`, `src/tools/wordpress.ts`
**Estimated scope:** Medium

### TASK-033: Import a WordPress post into an analysis
**Description:** `nw_wordpress action: post` returns the content; a documented two-step flow pairs it with `nw_import_content`. Optionally add `import_into: query`, which uses `wp-get-post {analysis, post_id, post_type}` so NeuronWriter links the post to the analysis, then saves.

**Acceptance criteria:**
- [ ] A live post's content lands in a test analysis byte-identical, and the analysis shows the WP link

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: live

**Dependencies:** TASK-032, TASK-004
**Files likely touched:** `features/wordpress.ts`, `src/tools/wordpress.ts`
**Estimated scope:** Small

### TASK-034: Publish to WordPress
**Description:** `nw_publish_wordpress {query, post_id?, post_type: post|page, status: draft|publish, confirm}` → `wp-update-post` with the saved article. The default is draft. It writes to the owner's live site, so it is annotated openWorld and non-idempotent, and the description says so. It returns the WP URL and post id.

**Acceptance criteria:**
- [ ] A draft is created on the owner's site, visible in wp-admin, and then deleted by the owner

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: owner confirms the draft

**Dependencies:** TASK-033
**Files likely touched:** `features/wordpress.ts`, `src/tools/wordpress.ts`
**Estimated scope:** Small

### TASK-035: Tool-surface review and evals
**Description:**
- Inspector pass over all tools: names, descriptions (3–4+ sentences, costs), annotations, output caps.
- Write `evals/neuronwriter.eval.xml`: 10 read-only questions answerable from the owner's data, in mcp-builder format.
- Run the evals with a fresh agent.

**Acceptance criteria:**
- [ ] ≥ 8/10 evals correct; no tool output over 50k characters with defaults

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Manual check: Inspector screenshot list

**Dependencies:** all previous
**Files likely touched:** `evals/neuronwriter.eval.xml`, `src/tools/*.ts`
**Estimated scope:** Medium

### TASK-036: Release 1.0
**Description:**
- Every row of `docs/capability-map.md` is ✅ or a listed non-goal.
- Update README tools table, CLAUDE.md architecture and tools, CHANGELOG `1.0.0`.
- Tag `v1.0.0`.

**Acceptance criteria:**
- [ ] No 🟡 left in the capability map
- [ ] Owner completes one real article end-to-end with only the MCP

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

**Dependencies:** TASK-035
**Files likely touched:** docs, `package.json`
**Estimated scope:** Small

## 6. Risks and Assumptions
| ID | Risk / Assumption | Impact | Mitigation / Note |
|----|-------------------|--------|-------------------|
| RISK-001 | Terms of Service may forbid automation; lifetime account at stake | High | Human pacing (Limiter), no bulk jobs, one request at a time, no captcha solving; unchanged from plan 001 |
| RISK-002 | Internal endpoints change (the app is at JS v1.1.57) | Med | Probe before each task (REQ-002); fixtures + `interpretResponse` fail loudly; `smoke-live.mjs` after every phase |
| RISK-003 | AI verification exhausts the monthly 15,000 credits | Med | Budget REQ-007, spend log per run, smallest inputs, heavy kinds only with explicit approval or after 2026-11-12 |
| RISK-004 | Full-replace endpoints wipe data (settings, tags, task fields) | High | Read-then-write everywhere (REQ-005); before/after equality checks in live scripts |
| RISK-005 | Some areas render data as HTML only (internal links, comments, AI Visibility, hub pages) | Med | Parse with the app's own DOM in `page.evaluate`; fixture each HTML shape |
| RISK-006 | More than two concurrent MCP clients still contend for the profile | Low | Lock-retry + 3-min idle; ALT-003 daemon if it becomes a real problem |
| RISK-007 | WordPress publish writes to the live site | High | Draft by default, confirm required, verified with the owner watching |
| RISK-008 | AI Visibility prompts consume the 5 monitored slots | Low | Add one, delete after verification unless the owner keeps it |
| ASM-001 | Plagiarism checks and metric refreshes may have their own quotas | - | Probe in TASK-017/022; confirm-gated until known |
| ASM-002 | `delete-analysis` is a soft delete undone by removing the Deleted tag | - | Verified in TASK-021 before the tool ships |
| ASM-003 | Inventory tables load on a page or tab not captured on 2026-10-13 | - | TASK-025 finds it first |
| ASM-004 | The owner will free a project slot (said 2026-10-13) and save WordPress credentials in the UI | - | TASK-028 and Phase 8 wait for it |

## 7. Open Questions
- Which project will the owner delete, and when? (TASK-028 waits for a free slot.)
- Which WordPress site goes with which project, and when will the owner save its user and application password in Project settings → Integrations? (Phase 8.)
- Approve the verification budget: ≤ 4 analyses and ≤ 6,000 AI credits before 2026-11-12. Heavy runs (facts ~5,000, Content Designer article, auto-insert ~2,000) are asked one by one.
- Is Google Search Console connected to either project? (`nw_lookup url_keywords` needs it.)
- Default export folder `~/Downloads/neuronwriter-mcp/` — OK?

## 8. Rollback Plan
- Each phase ships as its own minor version (`v0.4.0` …), tagged. `git checkout v0.3.0 && npm run build` restores the verified 17-tool server. The registered MCP command points at `build/index.js`, so a rebuild is the whole rollback.
- Live changes are reverted by each live script's `finally` (REQ-006). What is left on the account is listed in the script's output and in the capability map's test log.
- Remove the server entirely: `claude mcp remove neuronwriter`; delete `~/.neuronwriter-mcp/` to drop the session.
