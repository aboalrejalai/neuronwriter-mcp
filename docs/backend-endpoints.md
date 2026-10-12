# NeuronWriter internal endpoints (`/backend/*`)

Captured 2026-10-12 from `https://app.neuronwriter.com/assets/js/scripts.js` and `assets/js/editor-t.js` (plus inline scripts). Request shapes were read **read-only** from that JS in the owner's logged-in Chrome; one read call (`get-content-revision`) was made to confirm the response. Nothing was written and no credits were spent.

All are `POST` sent like `$.post(url, JSON.stringify({...}))`: body is a JSON string, `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, session cookie. No CSRF token. Responses are `application/json`.

Legend: **R** = read, **W** = write, **$** = spends analyses or AI credits, **⛔** = never call from the MCP. Paths used by the code live only in `src/backends/session/endpoints.ts`.

## Used by the MCP

| Endpoint | Kind | Tool | Request body | Response |
|---|---|---|---|---|
| `get-content-revision` | R | `nw_get_content` | `{analysis: contadu_analysis_sig, revision: <sig from optimize_content_revisions[i][0]>}` | `{content: {title, description, content (html), text, content_terms, custom_h1_terms, custom_h2_terms, custom_content_terms, custom_terms_ranges, word_count, competitors_avg_word_count, competitors_avg_readability, target_word_count, target_readability, treat_title_as_h1}}` — **verified live**, Arabic intact |
| `check-readability` | R | `nw_score_content`, `nw_import_content` | `{wizard_mode, text, title, draft_title:'', draft_description:'', description, content (html), content_terms: get_content_terms_to_check(), custom_h1_terms, custom_h2_terms, custom_content_terms, custom_terms_ranges, analysis, project: PROJECT_SIG, word_count, competitors_avg_word_count, competitors_avg_readability, target_word_count, target_readability, treat_title_as_h1}` | `{word_count, readability, keywords_matched, overall_score, score_parts{meta,headers,terms,balance}, subscore_parts, subscore_details, overall_score_details (html)}` (seen in `last_readability_update_data`) |
| `save-optimized-content` | W | `nw_import_content` | `{analysis, content: {title, description, content (html), text, content_terms: {term: {importance, uses}} (non-excluded), custom_*_terms, custom_terms_ranges, word_count, competitors_avg_*, target_*, treat_title_as_h1}, mark_as_done: false, plagia_info: null, autosave: 0}` | not seen yet (callback `finish_save_content_changes`) |
| `mark-content-as-done` / `unmark-content-as-done` | W | `nw_set_done` | `{analysis}` | `{status: 'ok'}` |
| `new-analysis` | W $ | `nw_create_query` | `{project, is_multiple_analysis: 0, keyword, multiple_keywords: '', custom_competitors: '', additional_keywords: 'one\nper\nline', target_url: '', engine: 'google.com.sa', language: 'Arabic', prefer_lang: '' or 1, update_inventory: 0, assigned_to, deadline, geolocation_mode: 'country'|'city', geolocation}` | `{status: 'ok', update_status?: 'ask', question_data?}` — **no analysis id**; the app redirects to the project page, so we find the new id in the table. Keywords may not contain `: [ ] " ,` |
| `generate-ai-outline` | W $ | `nw_generate_outline` | `{project, analysis, language: analysis_language, content_terms: get_content_terms_to_check()}` | `{status, mode, content, ai_credits, ai_usage_info, error}` (keys read by `finish_generate_ai_content`) |
| `generate-ai-content` | W $ | — (later) | `{mode: 'template'|'ai-selection'|'expand'|…, project, analysis, language, text, template_params: {template: <id>, …per template}, temperature, range_index, range_length, prev_gen_id, high_quality, suggested_output_len, content}` | same as outline. 36 templates in `ai_templates_definition` (`blog-outline`, `intro-terms`, `faq-unusedterms`, `one-click-long-form`, …); each builds its own `template_params` |
| `analysis-status` | R | — | `{analysis}` | collaboration "recently active" info, **not** readiness |

## Data that comes from pages, not endpoints

- **Recommendations** — `/analysis/view/<id>` globals, read through the page's own functions:
  - `get_must_have_terms(true,'json')` → `[{term: {min, max}}]` (basic terms with ranges), `get_extended_terms(true,'json')`, `get_title_terms('text')`, `get_description_terms('text')`, `get_h1_terms(true,'text')`, `get_h2_terms(true,'text')`
  - `content_terms[term] = {importance, uses: {text|h1|h2|h3|title|description: [avg, usage_pc, [competitor counts…]]}}`
  - `all_entities`, `first_h2_ideas` (`[[heading, score]]`), `target_word_count`, `target_readability`
  - competitors: `urls_by_id[i]`, `meta_titles[i]`, `params_charts_datasets['content-score'][i]`, `['content-length-words'][i]` (rank = i+1)
  - Questions (PAA etc.) were **not** found in globals — likely rendered HTML in the Ideas tab. TODO.
  - Not ready yet ⇔ `content_terms` missing or empty.
- **Queries of a project** — `/project/view/<id>/optimisation`, DataTable `#analyses_table` (client-side, no ajax). Row id `analysis_tr_<id>`; columns `Query, Target URL, Created (tooltip = exact date), Engine (flag), Score, Saved, Words, Content Comp., Volume, Paid Comp., CPC, Person, Deadline, Tags`. Done state not visible in the table. TODO.
- **Projects** — side navigation links `/project/view/<id>?from=side` on every page. Owner's: `6ec9249b8de0a586` makkahdecorsa.com (holds `ديكورات مكة` = `c1f8fbd2b38960d3`), `21132423440d01e0` ديكورات.
- **Plan and usage** — profile page text (`Content writer: N used / 25 per month`, `AI credits`, `Projects`, `Monthly limits reset`). URL `/ucp/profile` taken from the planning session; not re-verified.
- **Engine / language values** — same as the API: `google.com.sa`, `Arabic` (full language name).
- **Tags** — no tag-update endpoint identified; `nw_update_tags` is deferred.

## Full inventory (99)

```
add-analysis-access ⛔          add-analysis-comment           add-internal-link-comment
add-inventory-keywords          add-inventory-urls             add-term-to-project-keywords
add-to-content-plan             analysis-add-custom-term       analysis-delete-custom-term
analysis-exclude-term           analysis-report-term           analysis-select-competitors
analysis-status                 analysis-update-custom-term-params
analysis-update-exclusion-settings                             analysis-update-targets
auto-import-content             autoinsert-terms               check-for-plagiarism $
check-for-plagiarism-status     check-meta-score               check-project-limit
check-readability               check-readability-ai           create-update-inventory-task
delete-content-brief-template   delete-custom-ai-template      delete-project ⛔
edit-analysis-comment           export-content-as              export-table
extract-ai-overview             extract-facts                  generate-ai-content $
generate-ai-image $             generate-ai-image-ideas $      generate-ai-outline $
generate-schema-markup          get-ai-internal-links-suggestions
get-content-brief-cd            get-content-brief-personas     get-content-brief-template
get-content-revision            get-geolocation-list           get-hub-pages
get-internal-links-suggestions  get-inventory-task             get-nar-ideas
get-project-settings            get-recent-analyses            get-schema-markup-type
get-topic-creator-data          get-url-top-keywords           highlight-terms
integration/wp-check-availability                              integration/wp-get-post
integration/wp-get-post-link    integration/wp-get-posts       integration/wp-save-configuration
integration/wp-test             integration/wp-update-post     inventory-delete-object
inventory-edit-object           list-content-brief-templates   login ⛔
mark-content-as-done            new-analysis $                 new-content-topic
new-project                     new-project-domain             news-close ⛔
news-cta ⛔                     notifications-mark-all-as-read ⛔
notifications-mark-as-read ⛔   report-ai-content-not-used     request-moz-update
request-volume-update           revoke-analysis-access ⛔      save-content-brief-cd
save-content-brief-template     save-custom-ai-template        save-optimized-content
stock-images-search             suggest-target-url-for-keyword survey ⛔
survey-submit ⛔                toggle-project-domain-list     unmark-content-as-done
update-analysis-distribution    update-comment-status          update-internal-link-status
update-inventory-target-url     update-inventory-url           update-project-settings
update-share-analysis-link ⛔   update-target-keyword          update-target-url
upload-object                   youtube-get-ideas
```

Later candidates (not in v0.1): `generate-schema-markup`, `get-internal-links-suggestions`, `youtube-get-ideas`, `extract-facts`, `get-topic-creator-data`, WordPress `integration/*` (Gold+ per AppSumo FAQ — may be locked on Bronze).

## Page globals seen on `/analysis/view/<id>`

`contadu_analysis_sig`, `content_terms`, `PROJECT_SIG`, `custom_terms_ranges`, `highlighted_terms`, `toc_headings`, `optimize_content_revisions`, `ai_recently_generated_content`, `template_params`, `current_project_personas`, `brief_contents`. Recommendations most likely come from `content_terms` + heading-term globals — confirm in TASK-003.
