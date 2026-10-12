---
name: neuronwriter-api
description: >-
  Complete API integration for NEURONwriter — the SEO content optimization platform.
  Use this skill for ANY content creation, SEO analysis, keyword research, competitor
  SERP analysis, content optimization, or bulk content workflow task. This skill triggers
  whenever the user wants to create SEO-optimized content, analyze keywords against real
  SERP data, get NLP term recommendations, write content that ranks, evaluate content
  scores, import/export content between NeuronWriter and other tools, or automate content
  pipelines. If the user mentions keywords, content scoring, SERP analysis, competitor
  URL analysis, term optimization, content import/export, or any SEO writing workflow
  — load this skill. It turns the agent into a NeuronWriter API expert — exploring the
  API, creating queries, polling for readiness, extracting recommendations, generating
  optimized content, importing HTML, evaluating scores, and automating the full lifecycle.
compatibility:
  require: ["curl", "python3", "bash"]
---

# NeuronWriter API Skill

> **Author**: Anton Gulin · **Tool**: [opencode-skill-creator](https://github.com/antongulin/opencode-skill-creator) · **GitHub**: [@antongulin](https://github.com/antongulin) · **Registry**: [skills.sh](https://www.skills.sh/docs)

## Quota System

The API (v0.5) only consumes **content writer analysis credits** (1 per `new-query`). Each account's limit depends on their plan.

**What the API does NOT expose:**
- No endpoint to check remaining credits — the user must check their dashboard
- AI content generation credits — web UI only, no public API
- Plagiarism check credits — web UI only, no public API

**How to detect quota exhaustion:** If `new-query` returns `{"error": "The analysis exceeds the number of keyword analyses available for this month."}`, the monthly content writer limit is hit. Use the proxy fallback strategy below until the reset date (shown in the user's dashboard).

## Golden Rule
**1. Always use real API data. Never mock.**
**2. Always log every command in a "Commands Used" section.**
**3. If new-query fails, use list-queries + get-query fallback. Never give up.**

## Decision Flow

```
User asks about a keyword/topic
│
├─ Do we have API keys? ──No──→ Ask user for API key, then retry
│
├─ Does project exist in list-projects? ──No──→ Set up project, ask user
│
├─ Does keyword exist in list-queries? ──Yes──→ get-query → extract data
│                                ──No──→ try new-query
│                                          │
│                                          ├─ quota hit? → proxy from nearest query
│                                          └─ success → wait for "ready"
│
├─ Data ready → extract metrics, terms_txt, ideas, competitors, serp_summary
│
├─ PRESENT: brief with scores, terms, intent analysis, competitor benchmarks
│
├─ ASK: "Generate content from this data?"
│   ├─ No → offer alternate next steps
│   └─ Yes →
│        ├─ Generate HTML using term ranges and H2/H3 structure
│        ├─ ASK: "Import to NeuronWriter for scoring?"
│        │   ├─ No → done
│        │   └─ Yes → import-content → check score
│        │              ├─ score < target → fix terms → re-import → loop
│        │              └─ score ≥ target → celebrate + export
│        └─ Offer: run another keyword, export brief, compare competitors
│
└─ Always conclude: Commands Used + Next Steps (at least 3 concrete options)
```

## Quick Start (use this flow)

```
1. list-projects → find project ID
2. list-queries {"project":"ID"} → check existing data
3. try: new-query {...} → if fails: get-query for nearest existing keyword
4. extract: metrics, terms_txt, ideas, competitors, serp_summary
5. produce: structured output with real values + commands-used.md
```

## Available Endpoints
All POST to `https://app.neuronwriter.com/neuron-api/0.5/writer` with `X-API-KEY` header.

| Endpoint | Parameters | Returns |
|---|---|---|
| `list-projects` | {} | [{project, name, language, engine}] |
| `new-query` | {project, keyword, engine, language, additional_keywords?, competitors_mode?} | {query, query_url, share_url, readonly_url} |
| `get-query` | {query: ID} | {status, metrics, terms_txt, terms, ideas, competitors, serp_summary} |
| `list-queries` | {project, status?, source?, tags?} | [{query, keyword, created, ...}] |
| `get-content` | {query: ID, revision_type?} | {content, title, description} |
| `import-content` | {query, html/url, title?, description?} | {status, content_score} |
| `evaluate-content` | {query, html/url, title?, description?} | {status, content_score} |

The script `scripts/neuronwriter.sh` wraps all endpoints. Use `./scripts/neuronwriter.sh help` for usage.

## Data You Must Extract & Present (when status == "ready")

### 1. metrics.word_count.target
The precise word count minimum. Use it.

### 2. metrics.readability.target
The readability score to match.

### 3. terms_txt.content_basic — space-separated terms for LLM prompts
This format is specifically designed to be fed into an LLM prompt. Present it as: "Here are the NLP-recommended terms to include in your content as a space-separated list: `[content_basic string]`". This is useful when the user wants to write content manually.

### 4. terms_txt.content_basic_w_ranges — **CRITICAL. MUST USE.**
This is the **single most valuable output** of NeuronWriter. It tells you exactly which terms to use and how many times. Format example:
```
trail running shoe: 6-21x
best trail running shoe: 1-2x
traction: 1-8x
```

You MUST:
- Parse each line by splitting on `: ` to get `term` and `range` (e.g., "trail running shoe" → "6-21")
- Split the range on `-` to get `min` and `max` occurrences
- Present this as a table in your output
- When generating content, ENFORCE every term within its range — count occurrences
- When the user is writing manually, hand them this as a checklist

### 5. ideas.suggest_questions + ideas.people_also_ask + ideas.content_questions
Map these to H2/H3 structure. Group related questions under heading sections. `suggest_questions` are NLP-generated, `people_also_ask` are Google's, `content_questions` are extracted from competitors. Use all three.

### 6. competitors — with a ranking table
Display a **numbered ranking table** with columns: Rank | Competitor Name | URL | Content Score | Word Count. Sort by content_score descending. State "The target to beat is [highest_score] — our content needs at least [highest_score + 1]." If a proxy query is used, explain which keyword the competitor data comes from.

### 7. serp_summary — full intent analysis
`top_intent` → the dominant intent
`intent_stats` → show the % breakdown as a table. Explain strategy: "70% informational means educate, not sell. 80% transactional means include pricing and CTAs."
`content_type_stats` → show which formats dominate. **Mirror the winning format.** If guides dominate, write a guide. If product pages dominate, write a product page. If business pages dominate, write a landing page.

### 8. terms[].usage_pc + terms[].sugg_usage
Detailed term objects with competitor usage percentages and suggested ranges. Use `usage_pc` to prioritize: terms with 80%+ competitor usage are critical. Terms with 50%+ are important. Terms under 50% are supporting.

## Output Template

Your response must include:
```
## Discovery
[Projects found, existing queries]

## API Data
[Word count target, readability target, term usage %, SERP intent, competitor scores]

## Content Brief
[H2 structure, questions to answer, term requirements, CTA]

## Commands Used
1. ./scripts/neuronwriter.sh list-projects
2. ./scripts/neuronwriter.sh ...

## Next Steps
```

### Next Steps — always populate with concrete actions

After presenting the data, tell the user what to do next. Always include at least 3 of these:

- **"Generate content from this data?** I can write a full article using the term ranges, H2 structure, and word count target above."
- **"Import to NeuronWriter for scoring?** Your content can be sent back via `import-content` to get a live content_score and see which terms you're over/under-using."
- **"Run another keyword?** Let me know what other keyword you'd like to analyze."
- **"Compare competitors?** I can pull competitor scores and show where your content needs to outperform."
- **"Wait for quota reset?** If new-query hit a quota limit, I can retry later or use proxy data from an existing query."
- **"Export this brief?** I can format this as a markdown file or structured JSON for your content team."
- **"Refine the query?** I can re-run with different competitors_mode (top10, top30, top-intent) or additional keywords."

## Content Generation Flow

After presenting API data, ask the user: **"Would you like me to generate content from this data?"**

If yes, follow this flow:

1. **Plan the structure**: Use `ideas.suggest_questions` and `ideas.people_also_ask` to create H2/H3 headings. Group related questions under H2 sections.
2. **Enforce term ranges**: From `terms_txt.content_basic_w_ranges`, build a frequency checklist. Every term must appear within its min-max range. Track your counts during generation — verify after.
3. **Hit the word count**: Use `metrics.word_count.target` as the minimum. Never write fewer words.
4. **Match readability**: Write at the level specified by `metrics.readability.target`.
5. **Follow SERP intent**: If `serp_summary.top_intent` is informational, write an educational guide. If commercial, include comparison/CTA sections.
6. **Beat competitors**: Reference `competitors[].content_score` — generate content that would score higher.
7. **Output as HTML**: Produce the result in clean HTML (wrapped in a markdown code block) that can be directly imported to NeuronWriter.

Always show the user the generated content before importing — let them approve the draft.

## Import & Score Loop — MUST EXECUTE, NOT JUST OFFER

Do not just offer to import. After the user approves the generated content, **actually run `import-content`**. This is the core value of the skill.

1. **Send the HTML**: Use `import-content` with `{query, html, title, description}`. The content must be valid HTML from `<h1>` down.
2. **Check the score**: The response includes `content_score` (0-100).
3. **Diagnose**: If the score is below the target (competitor max + 1), analyze why:
   - Check which terms are under/over-used
   - Adjust term frequency in your generated HTML and re-import
   - Verify readability score is in range
   - Check word count meets the target
4. **Iterate**: Repeat "adjust → re-import → check score" until content_score exceeds the top competitor
5. **Celebrate**: Once you beat the top competitor score, report the final score and export the winning content

This loop is the core value of NeuronWriter — don't just hand the user raw data; help them achieve a score that beats the competition.

## Quota Handling (Critical)

When `new-query` returns quota error, use the **proxy fallback strategy** below. Do NOT give up or produce generic content.

## Proxy Fallback Strategy — Exact Method

When quota is exhausted, you MUST find and use data from existing queries. Follow this method:

### Step 1: List all queries in the project
```bash
./scripts/neuronwriter.sh list-queries '{"project":"PROJECT_ID", "status":"ready"}'
```

### Step 2: Select the best proxy keyword(s)

Score each existing query's relevance to the user's target keyword:
- **Same industry + same service category** → best (e.g., "hvac repair" for "emergency hvac repair")
- **Same industry + different subcategory** → good (e.g., "hvac maintenance" for "hvac repair")
- **Same project + related intent** → acceptable (same domain, similar user intent)
- **Different project/same industry** → weak (different geographic market)

### Step 3: Use multi-proxy strategy
Always fetch 2-3 proxy queries if available. Different proxies may reveal different competitor sets, different term recommendations, and different intent distributions. Present the data clearly labeled:

> "Proxy data from [keyword 1], [keyword 2], and [keyword 3]. The actual [user keyword] data will be more precise once quota resets on May 25."

### Step 4: Extract real values from each proxy
Pull actual word count targets, competitor scores, term usage percentages, and SERP intent data from each proxy. Do NOT average them — present them side by side so the user sees the range.

### Step 5: Tag queries for future retry
After creating proxies or if you find relevant queries, optionally add tags via the API (not directly supported, but document query IDs for the user).
