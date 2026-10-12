# NeuronWriter MCP

A local MCP server that lets AI agents use your NeuronWriter account (projects, content analyses, SEO recommendations, writing, scoring, NeuronWriter AI). It works on plans **without** API access by using your own logged-in browser session, and it can switch to the official API when a key is available.

> Status: the two open-source projects below are merged into this repo and the API-key MCP builds and runs. The browser-session backend (for plans without API access) is next — see [`.claude/plans/001-neuronwriter-mcp.plan.md`](.claude/plans/001-neuronwriter-mcp.plan.md).

## What's in this repo

| Path | What | From |
|---|---|---|
| `src/index.ts` | MCP server (stdio), 8 tools over API v0.5 | [softreviewed/neuronwriter-mcp-server](https://github.com/softreviewed/neuronwriter-mcp-server) + `wait_for_query` ported from the skill |
| `skills/neuronwriter-api/` | Agent skill: workflow (brief → write → import → score loop, quota fallback), bash API wrapper, evals | [antongulin/neuronwriter-api-skill](https://github.com/antongulin/neuronwriter-api-skill) |
| `docs/api/api-docs.md` | API v0.5 reference | antongulin, plus our notes |
| `docs/backend-endpoints.md` | The 99 internal `/backend/*` endpoints the web app uses (for the session backend) | ours |
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
- **If upgraded to Gold:** set `NEURONWRITER_API_KEY` → `NW_BACKEND=auto` uses the API for what it covers and the session for the rest. Or connect the official MCP directly.
- **Licenses:** both repos are MIT and their code is now part of this one; their notices stay in `THIRD_PARTY_NOTICES.md`. MIT lets us copy and change anything as long as the notice is kept.

## Use it today with an API key (Gold+)

```bash
npm install && npm run build
```

```bash
claude mcp add --scope user neuronwriter -e NEURONWRITER_API_KEY=your-key -- node /Users/aboarejal/Desktop/Project/neuronwriter-mcp/build/index.js
```

Claude Desktop / Cursor / Cline take the same block in their MCP config:

```json
{
  "mcpServers": {
    "neuronwriter": {
      "command": "node",
      "args": ["/absolute/path/to/neuronwriter-mcp/build/index.js"],
      "env": { "NEURONWRITER_API_KEY": "your-key" }
    }
  }
}
```

| Tool | What it does | Spends credits |
|---|---|---|
| `list_projects` | Your projects | — |
| `new_query` | New content analysis for a keyword | 1 analysis |
| `get_query` | SEO recommendations (terms + ranges, questions, competitors, SERP intent) | — |
| `wait_for_query` | Polls `get_query` until the analysis is ready | — |
| `list_queries` | Filter queries by status, source, keyword, tags… | — |
| `get_content` | Latest saved revision | — |
| `import_content` | Save HTML (or import a URL) into the editor, returns score | — |
| `evaluate_content` | Score HTML without saving | — |

The key can also be given as `NW_API_KEY`.

### The skill

`skills/neuronwriter-api/SKILL.md` teaches an agent the full workflow: discover → analyse → brief → write within the term ranges → import → re-score until it beats the top competitor, with a fallback to existing queries when the monthly quota is used up. Install it by copying the folder into your agent's skills path (e.g. `~/.claude/skills/`). Its bash wrapper works without the MCP:

```bash
NW_API_KEY=your-key ./skills/neuronwriter-api/scripts/neuronwriter.sh list-projects
```

```bash
NW_API_KEY=your-key ./skills/neuronwriter-api/scripts/neuronwriter.sh wait-and-get QUERY_ID 30
```

## Quick start for the session backend (planned)

```bash
npm install && npm run build
```

```bash
npm run login
```
A browser window opens. Log in yourself. The session is saved in `~/.neuronwriter-mcp/profile/`. Your password is never stored by this tool.

```bash
claude mcp add --scope user neuronwriter -- node /Users/aboarejal/Desktop/Project/neuronwriter-mcp/build/cli.js
```

Then ask Claude: *"Using NeuronWriter, show me the recommendations for ديكورات مكة and rewrite the article to hit the target score."*

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
