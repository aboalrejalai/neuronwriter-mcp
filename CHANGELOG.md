# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Heading ideas were empty: the analysis page only fills them after its own load-time reads, which were blocked. Those reads (`get-content-revision`, `check-readability`, `get-project-asset`) are now allowed; every page-initiated write stays blocked.
- Word count glued adjacent paragraphs together (394 instead of 409); block elements now break words.

### Added
- `scripts/smoke-live.mjs`: read-only live check of every tool that spends nothing, over real stdio.

## [0.2.0] - 2026-10-12

### Added
- Session backend: drives NeuronWriter through the owner's logged-in browser profile (Playwright), so the tools work on plans without API access.
- 10 `nw_*` tools: `nw_status`, `nw_list_projects`, `nw_list_queries`, `nw_get_recommendations`, `nw_get_content`, `nw_score_content`, `nw_import_content`, `nw_set_done`, `nw_create_query`, `nw_generate_outline`.
- `login` and `status` commands; `serve` stays the default.
- `confirm: true` gate on credit-spending tools; `nw_create_query` returns an existing analysis for the same keyword instead of spending.
- Request pacing (one at a time, 1.5 s before writes), backoff on 429/5xx for reads only.
- 34 fixture-based tests; recorded endpoint shapes in `docs/backend-endpoints.md`; research notes in `docs/research/`.

### Changed
- MCP SDK 0.5 → 1.32.1 (`McpServer.registerTool`), zod 4. The imported API client now sits behind a shared backend contract (`ApiBackend`), selected with `NW_BACKEND`.
- Tool names now carry the `nw_` prefix; `get_query` and `wait_for_query` became `nw_get_recommendations`.
- The skill maps its steps to the `nw_*` tools.

## [0.1.0] - 2026-10-12

### Added
- MCP server from softreviewed/neuronwriter-mcp-server@9fe5f8a as the base: 7 API v0.5 tools.
- `wait_for_query` tool, ported from the skill's `wait-and-get`.
- `NW_API_KEY` accepted as an alias for `NEURONWRITER_API_KEY`.
- Skill, bash API wrapper, evals and API reference from antongulin/neuronwriter-api-skill@c9ab509.
- Merged README, `THIRD_PARTY_NOTICES.md`, `LICENSE`.

### Fixed
- `neuronwriter.sh wait-and-get` exited immediately because it used `local` outside a function.

### Removed
- `docs/api-v0.5.md`, superseded by `docs/api/api-docs.md`.
