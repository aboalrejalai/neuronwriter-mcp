# NeuronWriter internal endpoints (`/backend/*`)

Captured 2026-10-12 from `https://app.neuronwriter.com/assets/js/scripts.js` and `assets/js/editor-t.js` (plus inline scripts) on the analysis editor page. All are `POST` with a JSON string body (`$.post(url, JSON.stringify({...}))`) and the session cookie. No CSRF meta tag observed.

Request/response shapes are **TODO — fill from `scripts/recon.ts` (TASK-003)**.

Legend: **R** = read, **W** = write, **$** = consumes analyses or AI credits, **⛔** = never call from the MCP.

## Used by the MCP (planned)

| Endpoint | Kind | Tool | Known body / notes |
|---|---|---|---|
| `/backend/get-recent-analyses` | R | `nw_list_queries` | TODO |
| `/backend/analysis-status` | R | `nw_create_query` (poll) | TODO |
| `/backend/project-status` | R | `nw_list_queries` | seen on the project page |
| `/backend/get-project-settings` | R | `nw_list_projects` | TODO |
| `/backend/check-project-limit` | R | `nw_create_project` | TODO |
| `/backend/get-content-revision` | R | `nw_get_content` | seen on editor load |
| `/backend/check-readability` | R | `nw_check_readability` | seen on editor load |
| `/backend/check-meta-score` | R | `nw_score_content` | TODO |
| `/backend/highlight-terms` | R | `nw_score_content` | TODO |
| `/backend/new-analysis` | W $ | `nw_create_query` | 1 of 25/month |
| `/backend/new-project` | W | `nw_create_project` | Bronze: 2/2 slots used |
| `/backend/save-optimized-content` | W | `nw_import_content` | `{analysis: contadu_analysis_sig, content: {title, description, content: html, text, content_terms: {term: {importance, uses}}, custom_h1_terms, custom_h2_terms, …}}` |
| `/backend/auto-import-content` | W | `nw_import_content` (url) | TODO |
| `/backend/mark-content-as-done` | W | `nw_mark_done` | TODO |
| `/backend/unmark-content-as-done` | W | `nw_unmark_done` | TODO |
| `/backend/generate-ai-outline` | W $ | `nw_generate_outline` | AI credits |
| `/backend/generate-ai-content` | W $ | `nw_generate_content` | AI credits |
| `/backend/check-readability-ai` | R $? | — | check if it costs credits |

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
