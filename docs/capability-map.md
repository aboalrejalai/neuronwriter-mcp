# NeuronWriter capability map

What the web app can do, what this MCP does today, and what is left. Built on 2026-10-13 from a read-only crawl of the owner's account (25 pages, 136 `/backend/*` endpoints in the app's JS) and four parallel code reviews. Request bodies for everything below are in [`backend-endpoints.md`](backend-endpoints.md) or were recorded in that review.

Legend: ✅ built and **tested live on the owner's account** · 🟡 endpoint known, not built yet · 🔒 blocked by plan or deliberately not automated.

## Account and projects

| Capability | Status | Tool / endpoint |
|---|---|---|
| Plan, monthly usage, reset date | ✅ | `nw_status` |
| List projects | ✅ | `nw_list_projects` |
| Read settings (name, domain, engine, language, keyword lists, domains, AI Profile, contact info, WordPress user) | ✅ | `nw_get_project_settings` |
| Change settings (same fields; everything else saved back unchanged) | ✅ | `nw_update_project_settings` (`update-project-settings` saves the whole form at once) |
| Add/remove one competitor or excluded domain | 🟡 | `toggle-project-domain-list` (toggle) — covered by `nw_update_project_settings` lists |
| AI Profile "Crawl and AI-extract" from up to 3 URLs | 🟡 | `extract-ai-overview` (fills the fields, does not save; likely spends AI credits) |
| Create a project | 🔒 | `new-project-domain` → `new-project`; the plan has 2/2 projects used |
| Delete a project / account | 🔒 | `delete-project`, `delete-my-account` — never automated |
| Share a project or analysis (sends an e-mail invite) | 🔒 | `add-project-access`, `add-analysis-access` — sends messages on the owner's behalf; not automated |
| WordPress: save credentials, test, import a post, publish to WordPress | 🟡 | `integration/wp-save-configuration`, `wp-test`, `wp-get-posts`, `wp-get-post`, `wp-update-post` (publishing writes to the live site) |
| Custom logo in reports | 🔒 | Agency/Enterprise plans only |
| Neuron API, official MCP, own OpenAI/Anthropic keys | 🔒 | Gold+ |

## Content Writer (analyses)

| Capability | Status | Tool / endpoint |
|---|---|---|
| List analyses with score, words, tags; active/done/deleted filter | ✅ | `nw_list_queries` |
| Create an analysis (1 of 25/month), dedupe by keyword | ✅ | `nw_create_query` |
| Supporting keywords, custom competitors, target URL, city geolocation on create | 🟡 | `new-analysis` fields not exposed yet: `custom_competitors`, `target_url`, `geolocation` |
| Recommendations: term ranges, title/H1/H2/description terms, entities, heading ideas, questions, targets, competitors with score, words and H1-H3 outline | ✅ | `nw_get_recommendations` |
| Choose competitors (top 10 / top 30 / custom) | ✅ | `nw_select_competitors` |
| Custom terms, ranges, exclude terms, negative-term filter | 🟡 | `analysis-add-custom-term`, `analysis-update-custom-term-params`, `analysis-exclude-term`, `analysis-update-exclusion-settings` |
| Word-count / readability targets | 🟡 | `analysis-update-targets` (`target_name` values not traced yet) |
| Read saved article | ✅ | `nw_get_content` (byte-identical Arabic) |
| Score content without saving (= editor score) | ✅ | `nw_score_content` |
| Save article (title, description, body) | ✅ | `nw_import_content` |
| Read + score any live URL | ✅ | `nw_fetch_page` (`auto-import-content`) |
| Mark done / not done | ✅ | `nw_set_done` |
| Tags (Optimize, Improve, Done, Deleted, custom); restore deleted | ✅ | `nw_update_tags` (`update-tags-status`, full replace) |
| Person / deadline | 🟡 | `update-analysis-management-info` |
| Analysis target URL | 🟡 | `update-target-url` |
| Soft-delete an analysis | 🟡 | `delete-analysis` (restorable via the Deleted tag) |
| Plagiarism check | 🟡 | `check-for-plagiarism` (likely spends credits) |
| Export DOCX etc. | 🟡 | `export-content-as` (returns base64) |
| Comments | 🟡 | `add-analysis-comment`, `edit-analysis-comment`, `update-comment-status` |
| Internal-link suggestions (classic / AI) | 🟡 | `get-internal-links-suggestions` / `get-ai-internal-links-suggestions` (AI credits) |
| Search Console keywords for a URL | 🟡 | `get-url-top-keywords` (needs Search Console) |

## NeuronWriter AI (AI credits)

| Capability | Status | Tool / endpoint |
|---|---|---|
| Outline (Content Designer template) | ✅ | `nw_generate_ai` kind `outline` |
| SEO title + meta description | ✅ | `nw_generate_ai` kind `meta` |
| Intro, paragraph under a heading, FAQ, rephrase, expand, one-click long-form article | 🟡 built, **not tried live yet** (same endpoint as outline/meta, template body from the app's form) | `nw_generate_ai` kinds `intro`, `paragraph`, `faq`, `rephrase`, `expand`, `article` |
| Auto-insert missing terms into the text (~2000 credits) | 🟡 | `autoinsert-terms` |
| AI content score | 🟡 | `check-readability-ai` |
| Extract facts from sources (~5000 credits) | 🟡 | `extract-facts` |
| AI images | 🟡 | `generate-ai-image-ideas`, `generate-ai-image` |
| Custom AI templates | 🟡 | `save-custom-ai-template`, `delete-custom-ai-template` |
| `generate-ai-outline` | 🔒 | dead code in the app; answers HTTP 500 |

Model choice (`model`): default = GPT-5 mini, `gpt-5`, `claude` (Sonnet 5), `gemini` (2.5 Flash).

## Planning

| Capability | Status | Tool / endpoint |
|---|---|---|
| Content plan: list ideas | ✅ | `nw_list_content_plan` |
| Content plan: add an idea | ✅ | `nw_add_content_plan_idea` |
| Content plan: delete idea, person, deadline | 🟡 | `delete-from-content-plan`, `update-cp-management-info` |
| Content management calendar (tasks by status/person) | 🟡 | `get-content-calendar-events` (form-encoded, not JSON) |
| Inventory: keywords, URLs, tasks, pillar/satellite pages | 🟡 | `add-inventory-*`, `inventory-*`, `create-update-inventory-task`, `update-inventory-url` |
| Topics (topic research) | 🔒 | "Module not available" on this plan |
| AI Visibility: brands, prompt suggestions, monitored prompts (0/5), readiness audit, earn-mention | 🟡 | `ai-tracker/*` (domain projects only; suggestions likely spend AI credits) |

## Live test log (2026-10-13)

Spent: 1 analysis ("بديل الخشب مكة", `6677c6ba75b413e6`) and 200 AI credits (meta + outline). Every test change was reverted (tag removed, setting restored, competitors back to top 10) except the content-plan idea "بديل الرخام مكة", kept on purpose.
