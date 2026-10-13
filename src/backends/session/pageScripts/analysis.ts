// Functions in this file run INSIDE a NeuronWriter page through page.evaluate().
// Playwright serializes them, so each one must be self-contained: no imports
// at runtime, no references to module scope. Page globals are declared in
// globals.d.ts and read with `typeof x !== 'undefined'`.

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
  excluded: unknown;
  custom: { text: unknown; h1: unknown; h2: unknown };
  customRanges: unknown;
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
    excluded: typeof excluded_terms !== 'undefined' ? excluded_terms : [],
    custom: {
      text: Object.values(typeof custom_content_terms_by_id !== 'undefined' ? custom_content_terms_by_id : {}),
      h1: Object.values(typeof custom_h1_content_terms_by_id !== 'undefined' ? custom_h1_content_terms_by_id : {}),
      h2: Object.values(typeof custom_h2_content_terms_by_id !== 'undefined' ? custom_h2_content_terms_by_id : {}),
    },
    customRanges: typeof custom_terms_ranges !== 'undefined' ? custom_terms_ranges : {},
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

export interface RawTermContext {
  ranges: Record<string, unknown>;
  customRanges: Record<string, unknown>;
  basic: string[];
  extended: string[];
  title: unknown;
  description: unknown;
  h1: unknown;
  h2: unknown;
  competitorsAvgWords: number | null;
}

/** Everything the editor uses to judge each term (finish_update_readability). */
export function readTermContext(): RawTermContext {
  return {
    ranges: typeof terms_suggested_usage !== 'undefined' ? terms_suggested_usage : {},
    customRanges: typeof custom_terms_ranges !== 'undefined' ? custom_terms_ranges : {},
    basic: typeof text_content_terms_must_have !== 'undefined' ? text_content_terms_must_have : [],
    extended: typeof text_content_terms_optional !== 'undefined' ? text_content_terms_optional : [],
    title: get_title_terms('text'),
    description: get_description_terms('text'),
    h1: typeof best_h1_terms !== 'undefined' ? best_h1_terms : [],
    h2: typeof best_h2_terms !== 'undefined' ? best_h2_terms : [],
    competitorsAvgWords: typeof competitors_avg_word_count !== 'undefined' ? competitors_avg_word_count : null,
  };
}

export function readProjectSig(): string | null {
  return typeof PROJECT_SIG !== 'undefined' ? PROJECT_SIG : null;
}

/** True for NeuronWriter's own recommended terms, false for the user's custom terms. */
export function isContaduTerm(term: string): boolean {
  return typeof content_terms !== 'undefined' && content_terms !== null && term in content_terms;
}

/** The editor's get_minimal_html(): only the tags NeuronWriter keeps in exports. */
export function minimalHtml(html: string): string {
  return html
    .replace(/<\/?div\b([^>]*)>/g, (m, attrs) => (m.startsWith('</') ? '</p>' : `<p${attrs}>`))
    .replace(/<\/?(?!strong)(?!b)(?!i)(?!strike)(?!ol)(?!ul)(?!li)(?!a)(?!p)(?!img)(?!h1)(?!h2)(?!h3)(?!h4)(?!h5)(?!h6)(?!br)(?!table)(?!thead)(?!tbody)(?!tfoot)(?!th)(?!tr)(?!td)(?!colgroup)(?!col)\w*\b[^>]*>/gi, '');
}

export function htmlText(html: string): string {
  const holder = document.createElement('div');
  holder.innerHTML = html.replace(/<\/(p|h[1-6]|li|div|blockquote|tr|td|th)>|<br\s*\/?>/gi, '$&\n');
  return (holder.textContent ?? '').trim();
}
