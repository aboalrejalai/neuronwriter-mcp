# NeuronWriter public API v0.5 (Gold+ only)

Our notes for `ApiBackend`. Source: NeuronWriter docs as summarised in [antongulin/neuronwriter-api-skill](https://github.com/antongulin/neuronwriter-api-skill) (`docs/api/api-docs.md`, MIT) and the endpoint used by [softreviewed/neuronwriter-mcp-server](https://github.com/softreviewed/neuronwriter-mcp-server) (MIT). Re-check against NeuronWriter's official docs before implementing TASK-014; the API is labelled beta.

- Base: `https://app.neuronwriter.com/neuron-api/0.5/writer`
- Auth: header `X-API-KEY: <key>` (Profile → Neuron API access)
- All methods `POST`, JSON in/out. Only `new-query` spends credits (1 analysis).

| Method | Body | Returns |
|---|---|---|
| `/list-projects` | — | `[{project, name, language, engine}]` |
| `/new-query` | `project, keyword, engine, language, additional_keywords?, competitors_mode? ("top10"\|"top30"\|"top-intent")` | `{query, query_url, share_url, readonly_url}` — ready after ~60 s |
| `/get-query` | `{query}` | `status` ("ready"/"waiting"/"in progress"/"not found"), `metrics` {word_count, readability}, `terms_txt` {title, desc_title, h1, h2, content_basic, content_extended, content_basic_w_ranges, entities}, `terms`, `ideas` {suggest_questions, people_also_ask, content_questions}, `competitors` [{rank,url,title,desc,content_score}], `serp_summary` |
| `/list-queries` | `project, status?, source? ("neuron"\|"neuron-api"), created?, updated?, keyword?, language?, engine?, tags?` | `[{id, query, created, updated, keyword, language, engine, source, tags}]` |
| `/get-content` | `{query, revision_type? ("manual"\|"all")}` | `{content, title, description, created, type}` |
| `/import-content` | `query, html? \| url?, title?, description?, id?, class?` | `{status:"ok", content_score}` |
| `/evaluate-content` | same as import | score only, nothing saved |

Not in the API (web UI only → `SessionBackend`): AI generation, plagiarism, content designer, AI images, credit balance. Limit exhausted → `{"error": "The analysis exceeds the number of keyword analyses available for this month."}`.

The `SessionBackend` must return the same shapes as `/get-query` and `/list-queries` so tools don't care which backend answered.
