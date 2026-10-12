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
  holder.innerHTML = args.html;
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
  holder.innerHTML = args.html;
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

/** Body of /backend/generate-ai-outline. */
export function buildOutlineBody(): Record<string, unknown> {
  return {
    project: PROJECT_SIG,
    analysis: contadu_analysis_sig,
    language: typeof analysis_language !== 'undefined' ? analysis_language : '',
    content_terms: get_content_terms_to_check(),
  };
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
