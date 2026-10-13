// Functions in this file run INSIDE a NeuronWriter page through page.evaluate().
// Playwright serializes them, so each one must be self-contained: no imports
// at runtime, no references to module scope. Page globals are declared in
// globals.d.ts and read with `typeof x !== 'undefined'`.

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

/** The project's "language|engine" targeting, as its search-volume refresh button sends it. */
export function readVolumeTargeting(): string | null {
  for (const el of document.querySelectorAll('[onclick*="request_search_volume_update"]')) {
    const match = (el.getAttribute('onclick') ?? '').match(/request_search_volume_update\('([^']+)'\)/);
    if (match) return match[1];
  }
  // Before any volume exists the button is absent; each analysis row's engine flag says "Targeting: ar|google.com.sa".
  const flag = document.querySelector('[data-bs-original-title^="Targeting: "]');
  return flag?.getAttribute('data-bs-original-title')?.replace('Targeting: ', '').trim() || null;
}

declare const AI_TRACKER_PROMPTS_AVAILABLE: number | undefined;
declare const AI_TRACKER_PROMPTS_USED: number | undefined;

export interface RawVisibilityPage {
  domainOnly: boolean;
  brands: string;
  used: number | null;
  available: number | null;
  prompts: Array<{ id: string; text: string }>;
}

/** /project/view/<id>/ai-tracker: brands, prompt slots and monitored prompts (rows open show_monitored_prompt_details('<sig>')). */
export function readVisibilityPage(): RawVisibilityPage {
  const prompts = new Map<string, string>();
  for (const el of document.querySelectorAll('[onclick*="show_monitored_prompt_details"]')) {
    const id = (el.getAttribute('onclick') ?? '').match(/show_monitored_prompt_details\('([^']+)'/)?.[1];
    if (!id || prompts.has(id)) continue;
    const row = el.closest('tr, li, .card, .monitored-prompt') ?? el;
    const text = (row.textContent ?? '').replace(/\s+/g, ' ').replace(/^Create\s+/, '').replace(/\s*Update status:.*$/, '').trim();
    prompts.set(id, text.slice(0, 300));
  }
  return {
    domainOnly: /Domain-related projects only/i.test(document.body.innerText),
    brands: (document.getElementById('tracker-configuration-brand-names') as HTMLTextAreaElement | null)?.value ?? '',
    used: typeof AI_TRACKER_PROMPTS_USED !== 'undefined' ? AI_TRACKER_PROMPTS_USED : null,
    available: typeof AI_TRACKER_PROMPTS_AVAILABLE !== 'undefined' ? AI_TRACKER_PROMPTS_AVAILABLE : null,
    prompts: [...prompts].map(([id, text]) => ({ id, text })),
  };
}
