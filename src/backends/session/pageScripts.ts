// Functions in this file run INSIDE a NeuronWriter page through
// page.evaluate(). Playwright serializes them, so each one must be
// self-contained: no imports, no references to module scope.
// Page globals are read with `typeof x !== 'undefined'` because some are
// declared with let/const (not on window) and some only exist on some pages.

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

export interface RawAnalysisPage {
  ready: boolean;
  documentTitle: string;
  targets: { wordCount: unknown; readability: unknown };
  basic: unknown;
  extended: unknown;
  title: unknown;
  description: unknown;
  h1: unknown;
  h2: unknown;
  entities: unknown;
  headingIdeas: unknown;
  competitorUrls: unknown;
  competitorTitles: unknown;
  competitorScores: unknown;
  competitorWords: unknown;
  /** Server-rendered "Structure ideas → Questions" list. */
  questions: string[];
  /** Server-rendered "Structure ideas → Headings": per competitor URL, its H1-H3 headings in order. */
  competitorHeadings: Array<{ url: string; headings: Array<{ level: number; text: string }> }>;
}

export function readAnalysisPage(): RawAnalysisPage {
  const ready = typeof content_terms === 'object' && content_terms !== null && Object.keys(content_terms).length > 0;
  const attempt = (fn: () => unknown) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const datasets = typeof params_charts_datasets !== 'undefined' ? params_charts_datasets : {};
  return {
    ready,
    documentTitle: document.title,
    targets: {
      wordCount: typeof target_word_count !== 'undefined' ? target_word_count : null,
      readability: typeof target_readability !== 'undefined' ? target_readability : null,
    },
    basic: ready ? attempt(() => get_must_have_terms(true, 'json')) : null,
    extended: ready ? attempt(() => get_extended_terms(true, 'json')) : null,
    title: ready ? attempt(() => get_title_terms('text')) : null,
    description: ready ? attempt(() => get_description_terms('text')) : null,
    h1: ready ? attempt(() => get_h1_terms(true, 'text')) : null,
    h2: ready ? attempt(() => get_h2_terms(true, 'text')) : null,
    entities: typeof all_entities !== 'undefined' ? all_entities : null,
    headingIdeas: typeof first_h2_ideas !== 'undefined' ? first_h2_ideas : null,
    competitorUrls: typeof urls_by_id !== 'undefined' ? urls_by_id : null,
    competitorTitles: typeof meta_titles !== 'undefined' ? meta_titles : null,
    competitorScores: datasets['content-score'] ?? null,
    competitorWords: datasets['content-length-words'] ?? null,
    questions: [...document.querySelectorAll('#outline-questions li.content-draft-idea-question[data-idea-title]')].map(
      (li) => li.getAttribute('data-idea-title') ?? '',
    ),
    competitorHeadings: [...document.querySelectorAll('#outline-headings .content-draft-competitor')].map((card) => ({
      url: card.querySelector('.competitor-url a[href]')?.getAttribute('href') ?? '',
      headings: [...card.querySelectorAll('li.content-draft-idea-h1, li.content-draft-idea-h2, li.content-draft-idea-h3')].map((li) => ({
        level: Number((li.className.match(/content-draft-idea-h([1-3])/) ?? [])[1] ?? 0),
        text: li.getAttribute('title') ?? (li.textContent ?? '').trim(),
      })),
    })),
  };
}

export function readRevisions(): { analysis: string | null; revisions: unknown } {
  return {
    analysis: typeof contadu_analysis_sig !== 'undefined' ? contadu_analysis_sig : null,
    revisions: typeof optimize_content_revisions !== 'undefined' ? optimize_content_revisions : null,
  };
}

interface ContentArgs {
  html: string;
  title: string;
  description: string;
}

/** Body of /backend/check-readability, built the way update_readability() builds it. */
export function buildCheckReadabilityBody(args: ContentArgs): Record<string, unknown> {
  const holder = document.createElement('div');
  // Break after block elements so words in adjacent paragraphs are not glued together.
  holder.innerHTML = args.html.replace(/<\/(p|h[1-6]|li|div|blockquote|tr|td|th)>|<br\s*\/?>/gi, '$&\n');
  const text = (holder.textContent ?? '').trim();
  return {
    wizard_mode: typeof WIZARD_MODE !== 'undefined' ? WIZARD_MODE : '',
    text,
    title: args.title,
    draft_title: '',
    draft_description: '',
    description: args.description,
    content: args.html,
    content_terms: get_content_terms_to_check(),
    custom_h1_terms: Object.values(typeof custom_h1_content_terms_by_id !== 'undefined' ? custom_h1_content_terms_by_id : {}),
    custom_h2_terms: Object.values(typeof custom_h2_content_terms_by_id !== 'undefined' ? custom_h2_content_terms_by_id : {}),
    custom_content_terms: Object.values(typeof custom_content_terms_by_id !== 'undefined' ? custom_content_terms_by_id : {}),
    custom_terms_ranges: typeof custom_terms_ranges !== 'undefined' ? custom_terms_ranges : {},
    analysis: contadu_analysis_sig,
    project: PROJECT_SIG,
    word_count: text ? text.split(/\s+/).length : 0,
    competitors_avg_word_count: typeof competitors_avg_word_count !== 'undefined' ? competitors_avg_word_count : null,
    competitors_avg_readability: typeof competitors_avg_readability !== 'undefined' ? competitors_avg_readability : null,
    target_word_count: typeof target_word_count !== 'undefined' ? target_word_count : null,
    target_readability: typeof target_readability !== 'undefined' ? target_readability : null,
    treat_title_as_h1: typeof project_treat_title_as_h1 !== 'undefined' ? project_treat_title_as_h1 : false,
  };
}

/** Body of /backend/save-optimized-content, built the way save_content_changes() builds it. */
export function buildSaveContentBody(args: ContentArgs): Record<string, unknown> {
  const holder = document.createElement('div');
  // Break after block elements so words in adjacent paragraphs are not glued together.
  holder.innerHTML = args.html.replace(/<\/(p|h[1-6]|li|div|blockquote|tr|td|th)>|<br\s*\/?>/gi, '$&\n');
  const text = (holder.textContent ?? '').trim();
  const termsToCheck: Record<string, unknown> = {};
  const terms = typeof content_terms !== 'undefined' && content_terms ? content_terms : {};
  for (const term of Object.keys(terms)) {
    const excluded = typeof is_term_excluded === 'function' ? is_term_excluded(term) : false;
    if (!excluded) termsToCheck[term] = { importance: terms[term].importance, uses: terms[term].uses };
  }
  return {
    analysis: contadu_analysis_sig,
    content: {
      title: args.title,
      description: args.description,
      content: args.html,
      text,
      content_terms: termsToCheck,
      custom_h1_terms: Object.values(typeof custom_h1_content_terms_by_id !== 'undefined' ? custom_h1_content_terms_by_id : {}),
      custom_h2_terms: Object.values(typeof custom_h2_content_terms_by_id !== 'undefined' ? custom_h2_content_terms_by_id : {}),
      custom_content_terms: Object.values(typeof custom_content_terms_by_id !== 'undefined' ? custom_content_terms_by_id : {}),
      custom_terms_ranges: typeof custom_terms_ranges !== 'undefined' ? custom_terms_ranges : {},
      word_count: text ? text.split(/\s+/).length : 0,
      competitors_avg_word_count: typeof competitors_avg_word_count !== 'undefined' ? competitors_avg_word_count : null,
      competitors_avg_readability: typeof competitors_avg_readability !== 'undefined' ? competitors_avg_readability : null,
      target_word_count: typeof target_word_count !== 'undefined' ? target_word_count : null,
      target_readability: typeof target_readability !== 'undefined' ? target_readability : null,
      treat_title_as_h1: typeof project_treat_title_as_h1 !== 'undefined' ? project_treat_title_as_h1 : false,
    },
    mark_as_done: false,
    plagia_info: null,
    autosave: 0,
  };
}

/** Heading ideas arrive a few seconds after load, once the page's own reads finish. */
export function headingIdeasLoaded(): boolean {
  return typeof first_h2_ideas !== 'undefined';
}

export function readAnalysisSig(): string | null {
  return typeof contadu_analysis_sig !== 'undefined' ? contadu_analysis_sig : null;
}

export interface RawQueryRow {
  id: string;
  keyword: string;
  created: string | null;
  engine: string | null;
  score: string | null;
  words: string | null;
  tags: string[];
}

/** Rows of #analyses_table on /project/view/<id>/optimisation (a DataTable). */
export function readQueriesTable(): RawQueryRow[] | null {
  const table = document.querySelector('#analyses_table');
  if (!table) return null;
  const jq = (window as unknown as { jQuery?: any }).jQuery;
  const rows: Array<{ node: Element; cell: (col: number) => Element | null }> = [];
  let headers: string[];
  if (jq?.fn?.dataTable?.isDataTable(table)) {
    // DataTables keeps paged-out rows and hidden columns out of the DOM; its API still has them.
    const dt = jq(table).DataTable();
    headers = dt.columns().header().toArray().map((h: Element) => (h.textContent ?? '').trim());
    for (const index of dt.rows().indexes().toArray()) {
      rows.push({ node: dt.row(index).node(), cell: (col) => dt.cell(index, col).node() });
    }
  } else {
    headers = [...table.querySelectorAll('thead th')].map((h) => (h.textContent ?? '').trim());
    for (const tr of table.querySelectorAll('tbody tr')) {
      rows.push({ node: tr, cell: (col) => (tr as HTMLTableRowElement).cells[col] ?? null });
    }
  }
  const col = (name: string) => headers.indexOf(name);
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim() || null;
  const tooltip = (el: Element | null) =>
    el?.querySelector('[data-bs-original-title]')?.getAttribute('data-bs-original-title') ?? null;
  const out: RawQueryRow[] = [];
  for (const { node, cell } of rows) {
    const link = node.querySelector('a[href*="/analysis/view/"]');
    const id = link?.getAttribute('href')?.split('/analysis/view/')[1]?.split(/[/?#]/)[0] ?? node.id.replace('analysis_tr_', '');
    if (!id) continue;
    const tagsCell = col('Tags') >= 0 ? cell(col('Tags')) : null;
    const badges = tagsCell ? [...tagsCell.querySelectorAll('.badge')].map((b) => (b.textContent ?? '').trim()) : [];
    const tags = badges.length ? badges : (text(tagsCell) ?? '').split(',').map((t) => t.trim());
    out.push({
      id,
      keyword: (link?.textContent ?? text(cell(col('Query'))) ?? '').trim(),
      created: col('Created') >= 0 ? (tooltip(cell(col('Created'))) ?? text(cell(col('Created')))) : null,
      engine: col('Engine') >= 0 ? (tooltip(cell(col('Engine'))) ?? text(cell(col('Engine')))) : null,
      score: col('Score') >= 0 ? text(cell(col('Score'))) : null,
      words: col('Words') >= 0 ? text(cell(col('Words'))) : null,
      tags: tags.filter(Boolean),
    });
  }
  return out;
}

/** Projects from the side navigation, present on every app page. */
export function readProjectsNav(): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const a of document.querySelectorAll('a[href*="/project/view/"]')) {
    const href = a.getAttribute('href') ?? '';
    if (!href.includes('from=side')) continue;
    const id = href.split('/project/view/')[1]?.split(/[/?#]/)[0];
    const name = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (id && name && !seen.has(id)) seen.set(id, name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

export function looksLikeLoginPage(): boolean {
  return Boolean(document.querySelector('input[type="password"]')) || /\/(login|signin|auth)\b/.test(location.pathname);
}

export interface InPageResponse {
  status: number;
  url: string;
  contentType: string | null;
  text: string;
}

/** POST the way jQuery's $.post(url, JSON.stringify(body)) does, plus our marker header. */
export async function postFromPage(args: { path: string; body: unknown; marker: string }): Promise<InPageResponse> {
  const response = await fetch(args.path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      [args.marker]: '1',
    },
    body: JSON.stringify(args.body),
  });
  return {
    status: response.status,
    url: response.url,
    contentType: response.headers.get('content-type'),
    text: await response.text(),
  };
}

/* AI writer globals (recorded 2026-10-13). */
declare const meta_title_terms: string[] | undefined;
declare const meta_description_terms: string[] | undefined;
declare const AI_TEMPERATURE_LEVELS: Record<number, number> | undefined;
declare function join_text_list_w_limit(list: unknown, limit: number, delimiter: string): string;
declare function get_meta_title_examples(count: number, sliceAt: number): string;
declare function get_meta_desc_examples(count: number, sliceAt: number): string;

export interface AiBodyArgs {
  template: string;
  /** Sent as wizard_mode by the Content Designer flows (outline, meta); omitted by the editor's template form. */
  wizardMode: string | null;
  title: string;
  text: string;
  heading: string;
  tone: string;
  wordCount: number;
  model: number;
  html: string;
}

/**
 * Body of /backend/generate-ai-content (mode "template"), built the way the
 * editor's template form and the Content Designer wizard build it.
 */
export function buildAiBody(args: AiBodyArgs): Record<string, unknown> {
  const join = (list: unknown) => (typeof join_text_list_w_limit === 'function' ? join_text_list_w_limit(list ?? [], 500, '\n') : (Array.isArray(list) ? list.join('\n') : ''));
  const keyword = document.title.split(' - analysis details')[0].trim();
  const title = args.title || keyword;
  const basic = join(get_must_have_terms(true, 'text'));
  const extended = join(get_extended_terms(true, 'text'));
  const h1 = join(get_h1_terms(true, 'text'));
  const h2 = join(get_h2_terms(true, 'text'));
  const entities = join(typeof all_entities !== 'undefined' ? all_entities : []);
  const temperature = typeof AI_TEMPERATURE_LEVELS !== 'undefined' ? AI_TEMPERATURE_LEVELS[3] : 0.7;
  const common = {
    mode: 'template',
    project: PROJECT_SIG,
    analysis: contadu_analysis_sig,
    language: typeof analysis_language !== 'undefined' ? analysis_language : '',
    text: '',
    temperature,
    range_index: null,
    range_length: null,
    high_quality: args.model,
  };
  if (args.template === 'content-designer-blog-outline') {
    return {
      wizard_mode: 'wizard-outline',
      ...common,
      template_params: { template: args.template, title, h1terms: h1, h2terms: h2, basicterms: basic, extendedterms: extended, entities, compoutlines: true, toneofvoice: args.tone, content_requirements: '' },
      content: '',
    };
  }
  if (args.template === 'content-designer-meta-title-and-description') {
    return {
      wizard_mode: 'wizard-meta',
      ...common,
      template_params: {
        template: args.template,
        titleterms: (typeof meta_title_terms !== 'undefined' ? meta_title_terms : []).join(', '),
        titleexamples: get_meta_title_examples(10, 500),
        descterms: (typeof meta_description_terms !== 'undefined' ? meta_description_terms : []).join(', '),
        descexamples: get_meta_desc_examples(5, 500),
        toneofvoice: args.tone,
      },
      content: '',
    };
  }
  // Editor template form: every field is always sent, empty when the template does not use it.
  const fields: Record<string, unknown> = {
    analysis_keyword: keyword, template: args.template, is_custom: false, prompt: '', systemrole: '',
    heading: args.heading, productname: '', categoryname: '', terms: '', metaterms: '', bulletpoints: '', toneofvoice: args.tone,
    keywords: '', keywordtitle: '', examples: '', videotitle: '', arttitle: '', lengthinwords: '', title, description: '',
    query: keyword, h1terms: h1, h2terms: h2, basicterms: basic, extendedterms: extended, entities,
    unusedbasicterms: basic, unusedextendedterms: extended, unusedh2terms: h2, termsoneperline: '', compoutlines: false,
    text: args.text, contentlength: args.wordCount, content_terms: typeof content_terms !== 'undefined' ? content_terms : {}, smart_mode: true,
  };
  if (args.template === 'intro-terms') Object.assign(fields, { keywordtitle: title, terms: basic, bulletpoints: args.text });
  if (args.template === 'paragraph-heading-terms') Object.assign(fields, { bulletpoints: args.text });
  return { ...common, template_params: fields, prev_gen_id: '', suggested_output_len: args.wordCount, content: args.html };
}

/** Body of /backend/auto-import-content: NeuronWriter fetches the URL and extracts its content. */
export function buildUrlImportBody(args: { url: string }): Record<string, unknown> {
  return { analysis: contadu_analysis_sig, url: args.url, strip_choices: [], custom_class_or_id: '', custom_class_or_id_val: '', import_images_mode: 'do-nothing' };
}

/** Competitor URLs in the analysis' competitor picker, with whether each is currently selected. */
export function readCompetitorSwitches(): Array<{ url: string; selected: boolean; top10: boolean }> {
  return [...document.querySelectorAll('input.comp-js-switch')].map((input) => ({
    url: input.getAttribute('name') ?? '',
    selected: (input as HTMLInputElement).checked,
    top10: input.classList.contains('comp-top10'),
  }));
}

/**
 * Every field /backend/update-project-settings expects, read from the settings
 * offcanvas the way the app's Save button reads them. The keyword lists are
 * not here: they come from /backend/get-project-settings.
 */
export function readProjectSettingsForm(): Record<string, unknown> | null {
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
  const checked = (id: string) => Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
  if (!document.getElementById('project-settings-select-engine-placeholder')) return null;
  return {
    mode: checked('project-settings-project-mode-domain') ? 'domain' : 'nondomain',
    name: value('project-settings-project-name-input'),
    homepage: value('project-settings-homepage-input'),
    engine: value('project-settings-select-engine-placeholder'),
    language: value('project-settings-select-language-placeholder'),
    currency: value('project-settings-select-currency-placeholder'),
    competitors: value('project_settings_competitors'),
    exclude: value('project_settings_exclude'),
    disable_terms_len_4: checked('content_writer_terms_disable_len_4'),
    treat_title_as_h1: checked('treat_title_as_h1_checkbox'),
    wordpress_rest_api_name: value('wordpress_rest_api_name'),
    wordpress_rest_api_password: value('wordpress_rest_api_password'),
    wordpress_rest_api_subdir: checked('wordpress_rest_api_subdir_checkbox'),
    wordpress_rest_api_subdir_loc: value('wordpress_rest_api_subdir'),
    use_custom_logo: checked('use_custom_logo_in_reports'),
    custom_logo: '',
    contact_info: value('custom_reports_contact_info'),
    ai_overview_project: value('ai_overview_project_textarea'),
    ai_overview_product_pricing: value('ai_overview_product_pricing_textarea'),
    ai_overview_labeling_entities: value('ai_overview_labeling_entities_textarea'),
    ai_overview_labeling_personas: value('ai_overview_personas_textarea'),
    ai_overview_brand_voice: value('ai_overview_brand_voice_textarea'),
  };
}

export interface RawContentPlanIdea {
  id: string;
  keyword: string;
  added: string | null;
  assignedTo: string;
  expected: string;
  additionalKeywords: string;
}

/** Idea cards (div#cp-<sig>) on /project/view/<id>/content-plan. */
export function readContentPlan(): RawContentPlanIdea[] {
  return [...document.querySelectorAll('div[id^="cp-"].cluster-details')].map((card) => {
    const id = card.id.slice(3);
    const writeButton = card.querySelector(`#cp-write-button-${id}`)?.getAttribute('onclick') ?? '';
    return {
      id,
      keyword: (card.querySelector('.seed-cluster-header')?.textContent ?? '').trim(),
      added: card.querySelector('[data-bs-original-title^="Idea added"]')?.getAttribute('data-bs-original-title')?.replace(/^.*:\s*/, '') ?? null,
      assignedTo: (card.querySelector(`#cp-assigned-to-${id}`)?.textContent ?? '').trim(),
      expected: (card.querySelector(`#cp-deadline-${id}`)?.textContent ?? '').trim(),
      additionalKeywords: writeButton.match(/additional_keywords='([^']*)'/)?.[1] ?? '',
    };
  });
}
