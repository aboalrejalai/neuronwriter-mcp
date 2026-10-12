# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
