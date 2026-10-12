// Pure conversions from raw page data / in-page responses to the Backend
// types. Kept free of Playwright so they can be tested against fixtures.

import { NeuronWriterError, PlanLimitError, RetryableError, SessionExpiredError, isPlanLimitMessage } from '../../errors.js';
import { sanitizeExternalText } from '../../sanitize.js';
import { analysisUrl, type AccountStatus, type Competitor, type QuerySummary, type Recommendations, type Score, type TermRange, type Usage } from '../Backend.js';
import type { InPageResponse, RawAnalysisPage, RawQueryRow } from './pageScripts.js';

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
    ideas: { headings: headingIdeas.map((h) => sanitizeExternalText(h)).filter((h): h is string => h !== null), questions: [] },
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
  if (message) throw isPlanLimitMessage(message) ? new PlanLimitError(message) : new NeuronWriterError(message);
  return data as Record<string, unknown>;
}

function errorText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error) return record.error;
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
