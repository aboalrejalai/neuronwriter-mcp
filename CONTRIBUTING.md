# Contributing

This MCP is MIT and meant for agents on NeuronWriter plans without the official API (Bronze included).

## Setup

```bash
npm install
npm run build
npm run login    # once — opens Chromium, you sign in
npm run status   # confirms session + monthly limits
```

Point your MCP client at `node /path/to/neuronwriter-mcp/build/index.js` with `NW_BACKEND=session`.

## Rules for PRs

- Keep `nw_score_content` and `nw_import_content` requiring `title` and `description`.
- Documented publish gate is **content_score ≥ 85** (or beat best competitor if higher).
- Add or update a fixture test under `test/` for tool/schema changes.
- Do not commit the Playwright profile under `~/.neuronwriter-mcp/`.
- Run `npm test` before pushing.

## Live scripts

`scripts/live/*.mjs` hit the real account. Prefer read-only steps unless the owner approved credit spend (`confirm: true`).
