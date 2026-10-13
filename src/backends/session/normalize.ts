// Pure conversions from raw page data / in-page responses to the Backend
// types. Kept free of Playwright so they can be tested against fixtures.

import { NeuronWriterError, PlanLimitError, RetryableError, SessionExpiredError, isPlanLimitMessage } from '../../errors.js';
import { sanitizeExternalText } from '../../sanitize.js';
import { analysisUrl, type AccountStatus, type Competitor, type ContentPlanIdea, type ProjectSettings, type ProjectSettingsPatch, type QuerySummary, type Recommendations, type Score, type TermRange, type Usage } from '../Backend.js';
import type { RawAnalysisPage } from './pageScripts/analysis.js';
import type { InPageResponse } from './pageScripts/common.js';
import type { RawContentPlanIdea, RawQueryRow } from './pageScripts/project.js';

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || value === 'null') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];

/** [{ "term": { min, max } }, …] → [{ term, min, max }] */
export function toTermRanges(value: unknown): TermRange[] {
  if (!Array.isArray(value)) return [];
  const out: TermRange[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push({ term: entry, min: null, max: null });
    } else if (entry && typeof entry === 'object') {
      for (const [term, range] of Object.entries(entry as Record<string, { min?: unknown; max?: unknown }>)) {
        out.push({ term, min: toNumber(range?.min), max: toNumber(range?.max) });
      }
    }
  }
  return out;
}

export function normalizeAnalysisPage(queryId: string, raw: RawAnalysisPage): Recommendations {
  const keyword = raw.documentTitle.split(' - analysis details')[0]?.trim() || null;
  const urls = raw.competitorUrls && typeof raw.competitorUrls === 'object' ? (raw.competitorUrls as Record<string, unknown>) : {};
  const titles = Array.isArray(raw.competitorTitles) ? raw.competitorTitles : [];
  const scores = Array.isArray(raw.competitorScores) ? raw.competitorScores : [];
  const words = Array.isArray(raw.competitorWords) ? raw.competitorWords : [];
  const headingsByUrl = new Map<string, Array<{ level: number; text: string }>>();
  for (const card of raw.competitorHeadings ?? []) {
    const headings = card.headings
      .map((h) => ({ level: h.level, text: sanitizeExternalText(h.text, 200) }))
      .filter((h): h is { level: number; text: string } => h.text !== null && h.level >= 1);
    if (card.url) headingsByUrl.set(card.url, headings);
  }
  const competitors: Competitor[] = [];
  for (const key of Object.keys(urls).sort((a, b) => Number(a) - Number(b))) {
    const index = Number(key);
    const url = sanitizeExternalText(urls[key], 500);
    if (!url) continue;
    competitors.push({
      rank: index + 1,
      url,
      title: sanitizeExternalText(titles[index]),
      content_score: toNumber(scores[index]),
      word_count: toNumber(words[index]),
      headings: headingsByUrl.get(String(urls[key])) ?? [],
    });
  }
  const headingIdeas = Array.isArray(raw.headingIdeas)
    ? raw.headingIdeas.map((idea) => (Array.isArray(idea) ? idea[0] : idea)).filter((h): h is string => typeof h === 'string')
    : [];
  return {
    query_id: queryId,
    keyword,
    status: raw.ready ? 'ready' : 'not_ready',
    targets: { word_count: toNumber(raw.targets.wordCount), readability: toNumber(raw.targets.readability) },
    terms: {
      content_basic: toTermRanges(raw.basic),
      content_extended: toTermRanges(raw.extended),
      title: stringList(raw.title),
      description: stringList(raw.description),
      h1: stringList(raw.h1),
      h2: stringList(raw.h2),
      entities: stringList(raw.entities),
    },
    ideas: {
      headings: headingIdeas.map((h) => sanitizeExternalText(h)).filter((h): h is string => h !== null),
      questions: (raw.questions ?? []).map((q) => sanitizeExternalText(q)).filter((q): q is string => q !== null),
    },
    competitors,
  };
}

export function normalizeQueryRows(rows: RawQueryRow[]): QuerySummary[] {
  return rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    created: row.created,
    engine: row.engine,
    content_score: toNumber(row.score),
    word_count: toNumber(row.words),
    tags: row.tags,
    url: analysisUrl(row.id),
  }));
}

/** optimize_content_revisions = [[sig, label, …], …], newest first; labels of autosaves start with "[autosave]". */
export function pickRevision(revisions: unknown): { sig: string; savedAt: string | null } | null {
  if (!Array.isArray(revisions) || revisions.length === 0) return null;
  const rows = revisions.filter((r): r is [string, string] => Array.isArray(r) && typeof r[0] === 'string');
  const manual = rows.find((r) => !String(r[1] ?? '').startsWith('[autosave]')) ?? rows[0];
  return manual ? { sig: manual[0], savedAt: manual[1] ? String(manual[1]).replace('[autosave] ', '') : null } : null;
}

export function normalizeScore(data: Record<string, unknown>): Score {
  return {
    content_score: toNumber(data.overall_score),
    word_count: toNumber(data.word_count),
    readability: toNumber(data.readability),
    details: data.score_parts && typeof data.score_parts === 'object' ? { score_parts: data.score_parts } : null,
  };
}

/** Turns an in-page fetch result into JSON or the right error. */
export function interpretResponse(response: InPageResponse): Record<string, unknown> {
  if (response.status === 429 || response.status >= 500) {
    throw new RetryableError(`NeuronWriter answered HTTP ${response.status}`, response.status);
  }
  if (response.status === 401 || response.status === 403 || /\/(login|signin)\b/.test(response.url)) {
    throw new SessionExpiredError();
  }
  let data: unknown;
  try {
    data = JSON.parse(response.text);
  } catch {
    // An HTML page instead of JSON almost always means we were bounced to the login page.
    if (/<html|<!doctype/i.test(response.text)) throw new SessionExpiredError();
    throw new NeuronWriterError(`Unexpected response from NeuronWriter (HTTP ${response.status}).`);
  }
  if (response.status >= 400) {
    throw new NeuronWriterError(errorText(data) ?? `NeuronWriter answered HTTP ${response.status}.`);
  }
  if (!data || typeof data !== 'object') return { value: data };
  const message = errorText(data);
  const outOfAiCredits = (data as Record<string, unknown>).ai_credits === 'yes';
  if (message || outOfAiCredits) {
    const text = message ?? 'Not enough AI credits.';
    throw outOfAiCredits || isPlanLimitMessage(text) ? new PlanLimitError(text) : new NeuronWriterError(text);
  }
  return data as Record<string, unknown>;
}

function errorText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error) return htmlToText(record.error) ?? record.error;
  if (Array.isArray(record.errors) && record.errors.length) return record.errors.map(String).join(' ');
  if (typeof record.errors === 'string' && record.errors) return record.errors;
  if (record.status === 'error') return typeof record.message === 'string' ? record.message : 'NeuronWriter reported an error.';
  return null;
}

const usage = (text: string, label: string): Usage | null => {
  const match = text.match(new RegExp(`${label}\\s*:?\\s*([\\d,]+)\\s*used\\s*/\\s*([\\d,]+)`, 'i'));
  return match ? { used: Number(match[1].replace(/,/g, '')), limit: Number(match[2].replace(/,/g, '')) } : null;
};

/** Parses the profile page's visible text ("Content writer: 0 used / 25 per month", …). */
export function parseProfileText(text: string): Omit<AccountStatus, 'backend' | 'logged_in'> {
  return {
    plan: text.match(/\b(Neuron-[A-Za-z0-9-]+)/)?.[1] ?? null,
    content_writer: usage(text, 'Content writer'),
    ai_credits: usage(text, 'AI credits'),
    projects: usage(text, 'Projects'),
    resets_at: text.match(/Monthly limits reset\s*:?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?:\s*UTC)?)/i)?.[1] ?? null,
  };
}

/** "14800 (99%) AI credits left out of 15000 …" (inside ai_usage_info HTML) → "14800 of 15000 AI credits left". */
export function parseAiUsage(html: unknown): string | null {
  const match = String(html ?? '').match(/([\d,]+)\s*\(\d+%\)\s*AI credits left out of\s*([\d,]+)/i);
  return match ? `${match[1]} of ${match[2]} AI credits left` : htmlToText(html);
}

/** Visible text of an HTML snippet (usage notes NeuronWriter returns as HTML). */
export function htmlToText(html: unknown): string | null {
  if (typeof html !== 'string' || !html.trim()) return null;
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() || null;
}

/** Tags cell text ("Optimize,Deleted") → ["Optimize", "Deleted"]. */
export function splitTags(text: string | null): string[] {
  return (text ?? '').split(',').map((t) => t.trim()).filter(Boolean);
}

const lines = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : String(value ?? '').split('\n')).map((l) => l.trim()).filter(Boolean);

export function normalizeContentPlan(rows: RawContentPlanIdea[]): ContentPlanIdea[] {
  return rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    additional_keywords: row.additionalKeywords.split(',').map((k) => k.trim()).filter(Boolean),
    added: row.added,
    assigned_to: row.assignedTo || null,
    expected: row.expected || null,
  }));
}

/** Form fields (update-project-settings names) + keyword lists → ProjectSettings. */
export function toProjectSettings(projectId: string, form: Record<string, unknown>, keywords: Record<string, unknown>): ProjectSettings {
  const text = (key: string) => String(form[key] ?? '');
  return {
    project_id: projectId,
    mode: form.mode === 'domain' ? 'domain' : 'nondomain',
    name: text('name'),
    homepage: text('homepage'),
    engine: text('engine'),
    language: text('language'),
    treat_title_as_h1: Boolean(form.treat_title_as_h1),
    disable_long_terms: Boolean(form.disable_terms_len_4),
    keywords: { desired: lines(keywords.desired), brand: lines(keywords.brand), negative: lines(keywords.negative), competitors: lines(keywords.competitors) },
    domains: { competitors: lines(form.competitors), excluded: lines(form.exclude) },
    ai_profile: {
      overview: text('ai_overview_project'),
      products_pricing: text('ai_overview_product_pricing'),
      labeling_entities: text('ai_overview_labeling_entities'),
      personas: text('ai_overview_labeling_personas'),
      brand_voice: text('ai_overview_brand_voice'),
    },
    report_contact_info: text('contact_info'),
    wordpress: {
      user: text('wordpress_rest_api_name'),
      password_set: text('wordpress_rest_api_password') !== '',
      subdirectory: Boolean(form.wordpress_rest_api_subdir),
      subdirectory_url: text('wordpress_rest_api_subdir_loc'),
    },
  };
}

/**
 * The full update-project-settings body: current values with the patch on top.
 * Fields the patch does not mention (WordPress credentials included) are sent
 * back unchanged, exactly like the app's Save button.
 */
export function applySettingsPatch(form: Record<string, unknown>, keywords: Record<string, unknown>, patch: ProjectSettingsPatch): Record<string, unknown> {
  const joined = (list: string[] | undefined, current: unknown) => (list ? list.join('\n') : lines(current).join('\n'));
  const body: Record<string, unknown> = {
    ...form,
    custom_logo: '',
    project_keywords: joined(patch.keywords?.desired, keywords.desired),
    brand_keywords: joined(patch.keywords?.brand, keywords.brand),
    negative_keywords: joined(patch.keywords?.negative, keywords.negative),
    competitors_keywords: joined(patch.keywords?.competitors, keywords.competitors),
  };
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.homepage !== undefined) body.homepage = patch.homepage;
  if (patch.engine !== undefined) body.engine = patch.engine;
  if (patch.language !== undefined) body.language = patch.language;
  if (patch.treat_title_as_h1 !== undefined) body.treat_title_as_h1 = patch.treat_title_as_h1;
  if (patch.disable_long_terms !== undefined) body.disable_terms_len_4 = patch.disable_long_terms;
  if (patch.report_contact_info !== undefined) body.contact_info = patch.report_contact_info;
  if (patch.domains?.competitors) body.competitors = patch.domains.competitors.join('\n');
  if (patch.domains?.excluded) body.exclude = patch.domains.excluded.join('\n');
  const ai = patch.ai_profile ?? {};
  if (ai.overview !== undefined) body.ai_overview_project = ai.overview;
  if (ai.products_pricing !== undefined) body.ai_overview_product_pricing = ai.products_pricing;
  if (ai.labeling_entities !== undefined) body.ai_overview_labeling_entities = ai.labeling_entities;
  if (ai.personas !== undefined) body.ai_overview_labeling_personas = ai.personas;
  if (ai.brand_voice !== undefined) body.ai_overview_brand_voice = ai.brand_voice;
  return body;
}
