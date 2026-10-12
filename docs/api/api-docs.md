# NeuronWriter API — Full Reference

## Overview

Base URL: `https://app.neuronwriter.com/neuron-api/0.5/writer`

Authentication: `X-API-KEY` HTTP header

All methods: POST unless specified. Request/response body: JSON.

## Methods

### /list-projects

Retrieves a list of projects within the account.

**Parameters:** None

**Response:** Array of projects:
```json
[{"project": "id", "name": "domain.com", "language": "English", "engine": "google.com"}]
```

### /new-query

Creates a new content writer query.

**Parameters:**

| Parameter | Required | Type | Description |
|---|---|---|---|
| project | yes | string | Project ID from URL |
| keyword | yes | string | Target keyword |
| engine | yes | string | Search engine (e.g., google.com, google.co.uk) |
| language | yes | string | Content language |
| additional_keywords | no | array | Supporting keywords |
| competitors_mode | no | string | "top10" (default), "top30", or "top-intent" |

**Response:**
```json
{
  "query": "query_id",
  "query_url": "https://app.neuronwriter.com/analysis/view/...",
  "share_url": "https://app.neuronwriter.com/analysis/share/...",
  "readonly_url": "https://app.neuronwriter.com/analysis/content-preview/..."
}
```

### /get-query

Retrieves recommendations for a query.

**Parameters:** `{"query": "query_id"}`

**Response (when ready):**

| Key | Description |
|---|---|
| status | "ready", "waiting", "in progress", "not found" |
| metrics | `word_count`: {median, target}, `readability`: {median, target} |
| terms_txt.title | Title term suggestions (space-separated) |
| terms_txt.desc_title | Description term suggestions |
| terms_txt.h1 | H1 term suggestions |
| terms_txt.h2 | H2 term suggestions |
| terms_txt.content_basic | Basic content terms (space-separated) |
| terms_txt.content_extended | Extended content terms |
| terms_txt.content_basic_w_ranges | Terms with suggested usage ranges |
| terms_txt.entities | Entity names (comma-separated) |
| terms | Detailed objects with `usage_pc`, `sugg_usage` range |
| ideas.suggest_questions | Questions to answer in content |
| ideas.people_also_ask | "People Also Ask" questions |
| ideas.content_questions | Questions extracted from competitor content |
| competitors | Array of {rank, url, title, desc, content_score} |
| serp_summary | Intent stats, content type stats (queries after 2025-08-26) |

### /list-queries

**Parameters:**

| Parameter | Required | Description |
|---|---|---|
| project | yes | Project ID |
| status | no | "waiting", "in progress", "ready" |
| source | no | "neuron", "neuron-api" |
| created | no | ISO date string |
| updated | no | ISO date string |
| keyword | no | Filter by keyword |
| language | no | Filter by language |
| engine | no | Filter by engine |
| tags | no | String or array of tags (all must match) |

**Response:** Array of query objects with id, query, created, updated, keyword, language, engine, source, tags.

### /get-content

**Parameters:** `{"query": "query_id", "revision_type": "manual"}`

revision_type can be "manual" (default) or "all" (includes autosaves).

**Response:** `{content: "HTML", title: "...", description: "...", created: "...", type: "manual"}`

### /import-content

**Parameters:**

| Parameter | Required | Description |
|---|---|---|
| query | yes | Query ID |
| html | no* | HTML content to import |
| title | no | Override title |
| description | no | Override meta description |
| url | no* | URL to auto-import from |
| id | no | CSS id of content container (for URL import) |
| class | no | CSS class of content container (for URL import) |

*One of html or url must be provided.

**Response:** `{"status": "ok", "content_score": 25}` or `{"status": "error", "error": "..."}`

### /evaluate-content

Identical to import-content but does NOT save a revision — only evaluates and returns the content score.

## Quota & Credit System (Important)

The API (v0.5) only consumes **content writer analysis credits** (1 per `new-query`). The following features are **web UI only** and have no API endpoints:

- **AI content generation** (uses AI credits) — no public API
- **Plagiarism checks** — no public API
- **Content Designer / one-click articles** — no public API
- **AI image generation** — no public API

There is no API endpoint to check remaining credits. To detect exhaustion: `new-query` returns `{"error": "The analysis exceeds the number of keyword analyses available for this month."}`.

## Notes

- Analysis typically takes ~60 seconds after new-query is created
- Beta API — support at support@neuronwriter.com
- Gold plan or higher required
- No other API versions (v1, v2) exist — only v0.5
