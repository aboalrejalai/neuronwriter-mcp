# NeuronWriter MCP

A local MCP server that lets AI agents use your NeuronWriter account (projects, content analyses, SEO recommendations, writing, scoring, NeuronWriter AI). It works on plans **without** API access by using your own logged-in browser session, and it can switch to the official API when a key is available.

> Status **v0.3.0**: 17 tools on MCP SDK 1.32.1, session backend (works on Bronze, no API key) and API backend, 45 tests, every tool tried live on the owner's account. Details: [`.claude/plans/001-neuronwriter-mcp.plan.md`](.claude/plans/001-neuronwriter-mcp.plan.md).

## What's in this repo

| Path | What | From |
|---|---|---|
| `src/index.ts` | CLI: `serve` (MCP on stdio, default), `login`, `status` | ours |
| `src/tools/` | The 17 `nw_*` tools | ours, tool names after the official MCP |
| `src/backends/session/` | Drives NeuronWriter through your logged-in browser profile (Playwright) | ours |
| `src/backends/api/ApiBackend.ts` | API v0.5 client (Gold+) | [softreviewed/neuronwriter-mcp-server](https://github.com/softreviewed/neuronwriter-mcp-server), moved behind the shared backend contract |
| `skills/neuronwriter-api/` | Agent skill: brief → write → import → score loop, quota fallback, bash API wrapper, evals | [antongulin/neuronwriter-api-skill](https://github.com/antongulin/neuronwriter-api-skill) |
| `docs/research/` | Verified MCP best practices this code follows | ours |
| `docs/backend-endpoints.md` | Internal `/backend/*` endpoints with recorded request shapes | ours |
| `docs/api/api-docs.md` | API v0.5 reference | antongulin, plus our notes |
| `THIRD_PARTY_NOTICES.md` | MIT notices of both projects | — |

## Why

My plan is **Neuron-Bronze-AppSumo** (lifetime): 25 analyses/month, 15,000 AI credits/month, 2 projects. NeuronWriter's API and official MCP both require **Gold or higher**, so none of the existing integrations below work on my account. This project fills that gap.

## Everything that already exists (and why we don't just use it)

### NeuronWriter official

| What | Link | Needs |
|---|---|---|
| Official MCP server (remote, OAuth, 12 tools) | `https://app.neuronwriter.com/mcp/http` · [FAQ](https://neuronwriter.com/faqs/what-is-the-neuronwriter-mcp-server/) | Gold+ |
| Neuron API v0.5 (beta) | `https://app.neuronwriter.com/neuron-api/0.5/writer/<method>`, header `X-API-KEY` · reference: [`docs/api/api-docs.md`](docs/api/api-docs.md) | Gold+ (key in Profile → *Neuron API access*) |
| Web app (what we automate) | https://app.neuronwriter.com/ | any plan |

The official MCP's 12 tools — our tool surface copies these names with an `nw_` prefix:
list projects · create project · list queries (filter by status/tags/source) · create content query · get recommendations · get competitor content · get latest saved content · import HTML/URL into editor · score HTML without saving · mark done · unmark done · update tags.

### Open-source projects (both MIT, both need an API key)

| Repo | Stars* | What it gives | What we took |
|---|---|---|---|
| [softreviewed/neuronwriter-mcp-server](https://github.com/softreviewed/neuronwriter-mcp-server) @ `9fe5f8a` | 9 | Small stdio MCP (207 lines, MCP SDK 0.5, axios). 7 tools: `list_projects`, `new_query`, `get_query`, `list_queries`, `get_content`, `import_content`, `evaluate_content` | **The base** — its code is `src/index.ts` |
| [antongulin/neuronwriter-api-skill](https://github.com/antongulin/neuronwriter-api-skill) @ `c9ab509` | 0 | Agent skill + bash script + the most complete **API v0.5 reference** I found, plus evals | **Layered on top** — skill, script (bug fixed), evals, API reference; its polling became the `wait_for_query` tool. Left out: its CodeGraph/Robin dev configs and its `AGENTS.md` |

\* checked 2026-10-12.

### Composio

| What | Link | Needs |
|---|---|---|
| Composio NeuronWriter toolkit (hosted, 1 tool: *Import Content*) | https://composio.dev/toolkits/neuronwriter | NeuronWriter **API key** (Gold+) + Composio account |

### Generic browser MCPs (could drive any site, slower, no NeuronWriter knowledge)

- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) — Apache-2.0
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) — Apache-2.0
- [browser-use/browser-use](https://github.com/browser-use/browser-use) — MIT

## How this project combines them

```
               ┌──────────── one tool surface (nw_*) ────────────┐
MCP client ──► │ nw_status · nw_list_projects · nw_list_queries   │
               │ nw_create_query · nw_get_recommendations         │
               │ nw_get_content · nw_import_content · nw_score…   │
               │ nw_mark_done · nw_update_tags · nw_generate_*    │
               └───────────────┬─────────────────────────────────┘
                               │ Backend interface
        ┌──────────────────────┼───────────────────────────┐
        ▼                      ▼                           ▼
 SessionBackend (now)    ApiBackend (if Gold)     Official MCP / Composio
 your browser session    neuron-api/0.5 + key     (use them directly if Gold —
 /backend/* endpoints                              no need to wrap them)
```

- **Today (Bronze):** `SessionBackend` does everything, including the AI writer the public API doesn't offer.
- **If upgraded to Gold:** set `NEURONWRITER_API_KEY` → `NW_BACKEND=auto` switches to the API (done marks and AI then report "session backend only"). Or connect the official MCP directly.
- **Licenses:** both repos are MIT and their code is now part of this one; their notices stay in `THIRD_PARTY_NOTICES.md`. MIT lets us copy and change anything as long as the notice is kept.

## Install

```bash
npm install && npm run build
```

```bash
npm run login
```
A browser window opens; sign in yourself. The session is kept in `~/.neuronwriter-mcp/profile/` (only you can read it). Your password never passes through this tool. Run it again whenever a tool says the session expired.

```bash
npm run status
```

```bash
claude mcp add --scope user neuronwriter -- node /Users/aboarejal/Desktop/Project/neuronwriter-mcp/build/index.js
```

Claude Desktop / Cursor / Codex take the same command in their MCP config:

```json
{
  "mcpServers": {
    "neuronwriter": { "command": "node", "args": ["/absolute/path/to/neuronwriter-mcp/build/index.js"] }
  }
}
```

With a Gold+ API key, add `"env": { "NEURONWRITER_API_KEY": "your-key" }` and the same tools run over the official API (AI and done marks stay session-only).

## Tools

17 tools, all tried on the owner's account on 2026-10-13 (`nw_generate_ai` with kinds `meta` and `outline`). Full map of what NeuronWriter can do and what is still to build: [`docs/capability-map.md`](docs/capability-map.md).

| Tool | What it does | Costs |
|---|---|---|
| `nw_status` | Session check, plan, monthly usage, reset date | — |
| `nw_list_projects` | Projects and their ids | — |
| `nw_get_project_settings` | Name, domain, engine, language, keyword lists, domains, AI Profile | — |
| `nw_update_project_settings` | Change any of those; the rest is saved back unchanged | — |
| `nw_list_content_plan` / `nw_add_content_plan_idea` | Content plan ideas | — |
| `nw_list_queries` | Analyses with score, words, tags; active / done / deleted | — |
| `nw_get_recommendations` | Term ranges, title/H1/H2 terms, entities, questions, heading ideas, targets, competitors with their H1-H3 outlines | — |
| `nw_select_competitors` | Top 10, top 30 or a custom competitor set | — |
| `nw_get_content` | Saved article | — |
| `nw_score_content` | Score HTML like the editor, without saving | — |
| `nw_fetch_page` | Read any URL (your page, a competitor) and score it | — |
| `nw_import_content` | Save title, description and body as a new revision | — |
| `nw_set_done` | Mark done / not done | — |
| `nw_update_tags` | Add/remove tags (Optimize, Done, Deleted…) | — |
| `nw_create_query` | New analysis; returns the existing one for the same keyword instead | **1 analysis**, `confirm: true` |
| `nw_generate_ai` | NeuronWriter AI: outline, meta title + description, intro, paragraph, FAQ, rephrase, expand, article | **AI credits**, `confirm: true` |

Typical request: *"Using NeuronWriter, improve the ديكورات مكة article until it beats the top competitor, save it and mark it done."*

### The skill

`skills/neuronwriter-api/SKILL.md` teaches an agent the full workflow (its "With the neuronwriter MCP" section maps each step to the `nw_*` tools): discover → analyse → brief → write within the term ranges → import → re-score until it beats the top competitor, with a fallback to existing queries when the monthly quota is used up. Install it by copying the folder into your agent's skills path (e.g. `~/.claude/skills/`). Its bash wrapper works without the MCP:

```bash
NW_API_KEY=your-key ./skills/neuronwriter-api/scripts/neuronwriter.sh list-projects
```

```bash
NW_API_KEY=your-key ./skills/neuronwriter-api/scripts/neuronwriter.sh wait-and-get QUERY_ID 30
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NW_BACKEND` | `auto` | `session`, `api`, or `auto` |
| `NW_PROFILE_DIR` | `~/.neuronwriter-mcp/profile` | browser profile with your session |
| `NEURONWRITER_API_KEY` | — | only with Gold+ |

## Caveats

- Uses undocumented internal endpoints; they can change. Breakage shows up in `nw_status`.
- Automating the web app may conflict with NeuronWriter's Terms of Service. This is a personal tool, paced like a human; use at your own risk.
- Credit-consuming tools say so in their description: creating an analysis costs 1 of your monthly analyses, and AI generation spends AI credits.
