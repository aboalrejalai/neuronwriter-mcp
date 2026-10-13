// Page globals of NeuronWriter pages (recorded 2026-10-12/13), for the
// functions in this folder. Type-only: nothing here exists at runtime in Node.

/* Page globals of /analysis/view/<id> (recorded 2026-10-12). */
declare const content_terms: Record<string, { importance: number; uses: unknown }> | undefined;
declare const contadu_analysis_sig: string | undefined;
declare const PROJECT_SIG: string | undefined;
declare const target_word_count: number | undefined;
declare const target_readability: number | undefined;
declare const competitors_avg_word_count: number | undefined;
declare const competitors_avg_readability: number | undefined;
declare const project_treat_title_as_h1: boolean | undefined;
declare const custom_h1_content_terms_by_id: Record<string, unknown> | undefined;
declare const custom_h2_content_terms_by_id: Record<string, unknown> | undefined;
declare const custom_content_terms_by_id: Record<string, unknown> | undefined;
declare const custom_terms_ranges: Record<string, unknown> | undefined;
declare const optimize_content_revisions: Array<[string, string, string]> | undefined;
declare const all_entities: string[] | undefined;
declare const first_h2_ideas: Array<[string, number]> | undefined;
declare const urls_by_id: Record<string, string> | undefined;
declare const meta_titles: string[] | undefined;
declare const params_charts_datasets: Record<string, unknown[]> | undefined;
declare const analysis_language: string | undefined;
declare const WIZARD_MODE: string | undefined;
declare function get_must_have_terms(excludeFilteredOut: boolean, format: string): unknown;
declare function get_extended_terms(excludeFilteredOut: boolean, format: string): unknown;
declare function get_title_terms(format: string): unknown;
declare function get_description_terms(format: string): unknown;
declare function get_h1_terms(excludeFilteredOut: boolean, format: string): unknown;
declare function get_h2_terms(excludeFilteredOut: boolean, format: string): unknown;
declare function get_content_terms_to_check(): unknown;
declare function is_term_excluded(term: string): boolean;

/* AI writer globals (recorded 2026-10-13). */
declare const meta_title_terms: string[] | undefined;
declare const meta_description_terms: string[] | undefined;
declare const AI_TEMPERATURE_LEVELS: Record<number, number> | undefined;
declare function join_text_list_w_limit(list: unknown, limit: number, delimiter: string): string;
declare function get_meta_title_examples(count: number, sliceAt: number): string;
declare function get_meta_desc_examples(count: number, sliceAt: number): string;

/* Term judgement globals (editor_t.js finish_update_readability, recorded 2026-10-13). */
declare const terms_suggested_usage: Record<string, [number, number]> | undefined;
declare const text_content_terms_must_have: string[] | undefined;
declare const text_content_terms_optional: string[] | undefined;
declare const best_h1_terms: string[] | undefined;
declare const best_h2_terms: string[] | undefined;
declare const excluded_terms: string[] | undefined;
declare const custom_ai_templates_definition: Record<string, unknown> | undefined;
