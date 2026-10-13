# NeuronWriter capability map

What the web app can do on the owner's Bronze plan, and what this MCP does about it. Built from a read-only crawl of the app (136 `/backend/*` endpoints), four parallel code reviews, and live runs on the owner's account.

Legend:
- ✅ built and **tried live on the owner's account**.
- 🟡 built and unit-tested, live run still pending (the reason is given).
- ⛔ deliberately not automated.
- 🔒 not on the plan, or needs something the owner must do first.

Live runs so far: 2026-10-12/13 on the old projects (deleted by the owner) and on `atalanajd.com` (`c4e17fb2aa86f36b`). On 2026-10-13 NeuronWriter left two new analyses of that project at 0 % for over an hour, so the analysis-level tools below wait for a ready analysis.

## Account and projects

| Capability | Status | Tool |
|---|---|---|
| Plan, usage, reset date | ✅ | `nw_status` |
| List projects | ✅ | `nw_list_projects` |
| Create a project (wizard: limit → domain check → create, keywords via settings) | ✅ created `atalanajd.com` | `nw_create_project` |
| Read / change settings: name, domain, engine, language, keyword lists, competitor and excluded domains, AI Profile, report contact; everything else saved back unchanged | ✅ | `nw_get_project_settings`, `nw_update_project_settings` |
| AI Profile extraction from up to 3 URLs (not saved) | 🟡 runs `extract-ai-overview`; AI credits | `nw_generate_ai` kind `ai_profile` |
| Delete a project or the account; sharing and invitations; profile, e-mail, 2FA, API key, billing | ⛔ | — |
| WordPress | 🔒 the owner's site is not WordPress (2026-10-13) | — |
| Custom report logo | 🔒 Agency+ | — |

## Content Writer (analyses)

| Capability | Status | Tool |
|---|---|---|
| List analyses with score, words, tags; active / done / deleted | ✅ | `nw_list_queries` |
| Create an analysis, dedupe by keyword | ✅ | `nw_create_query` |
| City targeting, custom competitors, target URL on create | 🟡 needs a run that spends an analysis | `nw_create_query` (`city`, `custom_competitors`, `target_url`) |
| Recommendations: term ranges, title/H1/H2/description terms, entities, heading ideas, questions, targets, competitors with H1-H3 outlines, excluded/custom terms | ✅ (except the excluded/custom fields: 🟡) | `nw_get_recommendations` |
| Competitors top 10 / top 30 / custom | ✅ | `nw_select_competitors` |
| Custom terms, ranges, exclude/re-include, negative filter | 🟡 ready analysis | `nw_update_terms` |
| Targets, target URL, person, deadline, distribution | 🟡 ready analysis | `nw_update_analysis` |
| Read saved article, any revision list | ✅ article · 🟡 revision list | `nw_get_content`, `nw_get_analysis_details` part `revisions` |
| Score without saving, with the editor's per-term verdict | ✅ score · 🟡 per-term list | `nw_score_content` |
| Save article (refuses while the web editor has it open) | ✅ save · 🟡 guard | `nw_import_content` |
| Read and score any URL | ✅ | `nw_fetch_page` |
| Mark done, tags (Done/Deleted/Optimize/…) | ✅ | `nw_set_done`, `nw_update_tags` |
| Soft delete / restore | 🟡 ready analysis | `nw_delete_query` + `nw_update_tags` |
| Plagiarism | 🟡 may use a plagiarism quota | `nw_check_plagiarism` |
| DOCX export to a file | 🟡 ready analysis | `nw_export_content` |
| Comments | 🟡 ready analysis | `nw_get_analysis_details` part `comments`, `nw_update_comments` |
| Internal-link suggestions, status, notes | 🟡 ready analysis | `nw_get_analysis_details` part `internal_links`, `nw_update_internal_links` |
| Content ideas from an analysis → content plan | 🟡 ready analysis | part `content_ideas`, `nw_update_content_plan` action `add_idea` |
| Refresh search volumes | ✅ | `nw_refresh_metrics` what `volume` |
| Refresh Moz metrics | 🟡 ready analysis | `nw_refresh_metrics` what `moz` |

## NeuronWriter AI (AI credits)

Everything below goes through one tool, `nw_generate_ai` with `confirm: true`. Model choice is `default` (GPT-5 mini), `gpt-5`, `claude` or `gemini`. `generate-ai-outline` is ⛔: it is dead code in the app and answers HTTP 500.

| Kinds | Status |
|---|---|
| `outline`, `meta` | ✅ (~100 credits each) |
| `intro`, `paragraph`, `faq`, `rephrase`, `expand`, `article`, `titles`, `product_description`, `category_description`, `product_reviews`, `content_plan_keywords`, `topical_map`, `youtube_description`, `email`, `synonyms`, `prompt` | 🟡 ready analysis (same endpoint and body path as `outline`/`meta`) |
| `insert_terms` (~2000), `ai_score`, `internal_links`, `image_ideas`, `image` (saved as a file), `custom`, `designer_article` | 🟡 ready analysis |
| `facts` (~5000) | 🟡 needs the owner's approval for the cost |
| `ai_profile`, `suggest_brands`, `suggest_prompts`, `readiness_audit`, `earn_mention`, `earn_mention_rewrite` | 🟡 project-scoped; run pending |
| Custom templates list/save/delete | 🟡 ready analysis | 

## Planning

| Capability | Status | Tool |
|---|---|---|
| Content plan: list, add, person, expected date, delete | ✅ | `nw_get_project_data` part `content_plan`, `nw_update_content_plan` |
| Content management calendar (dated analyses and plan ideas) | ✅ | `nw_get_project_data` part `calendar` |
| Stand-alone tasks | ⛔ hidden in the web UI (the calendar's "New task" button is commented out); the tool was removed after a live run created an invisible task | — |
| AI Visibility: overview, brands, add/delete monitored prompts (prompt id = MD5 of its text) | ✅ | `nw_get_project_data` part `ai_visibility`, `nw_update_ai_visibility` |
| AI Visibility prompt details | 🟡 needs a prompt kept for a while | part `ai_visibility_prompt` |
| Lookups: city locations, suggested target URL | 🟡 run pending | `nw_lookup` |
| Search Console keywords of a URL, hub pages, keyword/URL inventory | 🔒 needs Search Console connected to the project (the inventory lives on the Search Console "visibility" page) | `nw_lookup` (`url_keywords`, `hub_pages`) |
| Topics | 🔒 not on the plan | — |

## Robustness

| Concern | Status |
|---|---|
| Several Claude/Cursor sessions at once | ✅ two servers side by side; the second waits for the browser profile (up to 60 s, 3-min idle release) |
| AI Visibility page answers 500 while a new prompt initializes | ✅ handled: deleting a prompt avoids that page; 5xx reads as temporary |
| Writes retried after 5xx | ⛔ never (no double spend) |

## Live test log

- **2026-10-12 / 13, old projects (deleted since):**
  - Spent 1 analysis and 200 AI credits.
  - Every change was reverted.
- **2026-10-13, atalanajd.com:**
  - Created the project with its settings, 23 keywords, brand terms, domains and AI Profile, all kept on purpose.
  - Created 2 analyses: `871b250294d89d4c` «تصريف مياه الأمطار» and `6bd76502ab375a8d` «تجميع مياه الأمطار». Both were still at 0 % at the time of writing.
  - The test idea, the monitored prompt and the AI Visibility changes were reverted; the brand names were kept.
  - One invisible test task from `create-update-inventory-task` remains. The UI has no way to list or delete it.
