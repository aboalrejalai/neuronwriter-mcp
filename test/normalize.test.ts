import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeApiQuery, parseRangeLine } from '../src/backends/api/ApiBackend.js';
import { applySettingsPatch, interpretResponse, parseAiUsage, normalizeAnalysisPage, normalizeContentPlan, normalizeQueryRows, normalizeScore, parseProfileText, pickRevision, toProjectSettings } from '../src/backends/session/normalize.js';
import { NeuronWriterError, PlanLimitError, RetryableError, SessionExpiredError } from '../src/errors.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const json = (name: string) => JSON.parse(fixture(name));

describe('session: analysis page', () => {
  const rec = normalizeAnalysisPage('c1f8fbd2b38960d3', json('analysis-page.json'));

  it('maps terms, ranges and targets', () => {
    expect(rec.status).toBe('ready');
    expect(rec.keyword).toBe('ديكورات مكة');
    expect(rec.targets).toEqual({ word_count: 1034, readability: 20 });
    expect(rec.terms.content_basic[0]).toEqual({ term: 'مكة', min: 10, max: 32 });
    expect(rec.terms.content_extended).toHaveLength(2);
    expect(rec.terms.h2).toEqual(['مكة', 'معلم دهانات وديكورات']);
    expect(rec.ideas.headings[0]).toBe('أفضل معلم دهانات وديكورات في مكة');
  });

  it('builds competitors, skips empty URLs and strips hidden characters', () => {
    expect(rec.competitors).toHaveLength(2);
    expect(rec.competitors[0]).toEqual({
      rank: 1, url: 'https://decor-one.example/', title: 'ديكورات مكة - روائع الديكور', content_score: 54, word_count: 930,
      headings: [{ level: 1, text: 'ديكورات مكة' }, { level: 2, text: 'أعمالنا' }],
    });
    expect(rec.competitors[1].headings).toEqual([]);
    expect(rec.ideas.questions).toEqual(['من هو أفضل معلم ديكورات في مكة؟', 'كم تكلفة ديكورات الجبس؟']);
    expect(rec.competitors[1].url).toBe('https://decor-two.example/evil');
    expect(rec.competitors[1].title).toBe('Second competitor title');
  });

  it('reports not_ready with empty lists while the analysis is prepared', () => {
    const pending = normalizeAnalysisPage('0123456789abcdef', json('analysis-page-not-ready.json'));
    expect(pending.status).toBe('not_ready');
    expect(pending.terms.content_basic).toEqual([]);
    expect(pending.competitors).toEqual([]);
  });
});

describe('session: other pages', () => {
  it('normalizes query rows', () => {
    const rows = normalizeQueryRows(json('queries-table.json'));
    expect(rows[0]).toMatchObject({ id: 'c1f8fbd2b38960d3', keyword: 'ديكورات مكة', content_score: 9, word_count: 409, url: 'https://app.neuronwriter.com/analysis/view/c1f8fbd2b38960d3' });
    expect(rows[1]).toMatchObject({ content_score: 1234, word_count: null, tags: ['blog', 'q2'] });
  });

  it('picks the newest manual revision, falling back to an autosave', () => {
    expect(pickRevision([['a', '[autosave] 2026-02-07 20:20', ''], ['b', '2026-02-07 20:15', '']])).toEqual({ sig: 'b', savedAt: '2026-02-07 20:15' });
    expect(pickRevision([['a', '[autosave] 2026-02-07 20:20', '']])).toEqual({ sig: 'a', savedAt: '2026-02-07 20:20' });
    expect(pickRevision([])).toBeNull();
  });

  it('maps a check-readability response to a score', () => {
    expect(normalizeScore(json('check-readability.json'))).toEqual({
      content_score: 9,
      word_count: 407,
      readability: 42,
      details: { score_parts: { meta: 10, headers: 5, terms: 9, balance: 12 } },
    });
  });

  it('parses the profile page text', () => {
    expect(parseProfileText(fixture('profile.txt'))).toEqual({
      plan: 'Neuron-Bronze-AppSumo',
      content_writer: { used: 3, limit: 25 },
      ai_credits: { used: 1250, limit: 15000 },
      projects: { used: 2, limit: 2 },
      resets_at: '2026-10-12 17:30 UTC',
    });
  });
});

describe('session: interpreting /backend responses', () => {
  const response = (status: number, text: string, url = 'https://app.neuronwriter.com/backend/x') => ({ status, url, contentType: 'application/json', text });

  it('returns parsed JSON and keeps Arabic byte-identical', () => {
    const html = '<p>ديكورات مكة: الدليل الشامل</p>';
    expect(interpretResponse(response(200, JSON.stringify({ content: { content: html } })))).toEqual({ content: { content: html } });
  });

  it('maps login redirects and HTML pages to SessionExpiredError', () => {
    expect(() => interpretResponse(response(200, '<!DOCTYPE html><html>', 'https://app.neuronwriter.com/login'))).toThrow(SessionExpiredError);
    expect(() => interpretResponse(response(200, '<!DOCTYPE html><html><body>Sign in</body></html>'))).toThrow(SessionExpiredError);
    expect(() => interpretResponse(response(403, '{}'))).toThrow(SessionExpiredError);
  });

  it('maps 429/5xx to RetryableError', () => {
    expect(() => interpretResponse(response(503, 'down'))).toThrow(RetryableError);
    expect(() => interpretResponse(response(429, 'slow down'))).toThrow(RetryableError);
  });

  it('passes NeuronWriter errors through, recognizing plan limits', () => {
    expect(() => interpretResponse(response(200, JSON.stringify({ error: 'The analysis exceeds the number of keyword analyses available for this month.' })))).toThrow(PlanLimitError);
    expect(() => interpretResponse(response(200, JSON.stringify({ status: 'error', message: 'Bad keyword' })))).toThrow(new NeuronWriterError('Bad keyword'));
  });
});

describe('api backend mapping', () => {
  it('parses range lines', () => {
    expect(parseRangeLine('trail running shoe: 6-21x')).toEqual({ term: 'trail running shoe', min: 6, max: 21 });
    expect(parseRangeLine('odd line')).toEqual({ term: 'odd line', min: null, max: null });
  });

  it('maps get-query onto the shared shape', () => {
    const rec = normalizeApiQuery('0123456789abcdef', json('api-get-query.json'));
    expect(rec.status).toBe('ready');
    expect(rec.targets).toEqual({ word_count: 1800, readability: 62 });
    expect(rec.terms.content_basic.slice(0, 2)).toEqual([
      { term: 'trail running shoe', min: 6, max: 21 },
      { term: 'traction', min: 1, max: 8 },
    ]);
    expect(rec.terms.entities).toEqual(['Salomon', 'Hoka']);
    expect(rec.ideas.questions).toEqual(['Are trail shoes worth it?', 'Can you run on roads with trail shoes?']);
    expect(rec.competitors[0]).toMatchObject({ rank: 1, url: 'https://shop.example/trail', content_score: 71 });
  });
});

describe('session: project settings', () => {
  const form = {
    mode: 'domain', name: 'makkahdecorsa.com', homepage: 'https://makkahdecorsa.com', engine: 'google.com.sa', language: 'Arabic', currency: '',
    competitors: 'a.com\nb.com', exclude: '', disable_terms_len_4: false, treat_title_as_h1: false,
    wordpress_rest_api_name: 'admin', wordpress_rest_api_password: 'xxxx yyyy', wordpress_rest_api_subdir: false, wordpress_rest_api_subdir_loc: '',
    use_custom_logo: false, custom_logo: '', contact_info: '', ai_overview_project: 'old overview', ai_overview_product_pricing: '',
    ai_overview_labeling_entities: '', ai_overview_labeling_personas: '', ai_overview_brand_voice: '',
  };
  const keywords = { desired: 'ديكورات\nمكة', brand: '', negative: '', competitors: '' };

  it('never exposes the WordPress password', () => {
    const settings = toProjectSettings('6ec9249b8de0a586', form, keywords);
    expect(settings.wordpress).toEqual({ user: 'admin', password_set: true, subdirectory: false, subdirectory_url: '' });
    expect(JSON.stringify(settings)).not.toContain('xxxx');
    expect(settings.keywords.desired).toEqual(['ديكورات', 'مكة']);
    expect(settings.domains.competitors).toEqual(['a.com', 'b.com']);
  });

  it('sends every field back and changes only the patch', () => {
    const body = applySettingsPatch(form, keywords, { ai_profile: { brand_voice: 'ودود' }, keywords: { brand: ['روائع الديكور'] } });
    expect(body).toMatchObject({
      name: 'makkahdecorsa.com', engine: 'google.com.sa', competitors: 'a.com\nb.com',
      wordpress_rest_api_name: 'admin', wordpress_rest_api_password: 'xxxx yyyy',
      ai_overview_project: 'old overview', ai_overview_brand_voice: 'ودود',
      project_keywords: 'ديكورات\nمكة', brand_keywords: 'روائع الديكور',
    });
  });
});

describe('session: content plan', () => {
  it('splits supporting keywords', () => {
    expect(normalizeContentPlan([{ id: '3f8ad79c0eaab3c8', keyword: 'ديكورات جدة', added: '2026-01-05', assignedTo: '', expected: '', additionalKeywords: 'ديكورات جدة, ديكورات جده' }])).toEqual([
      { id: '3f8ad79c0eaab3c8', keyword: 'ديكورات جدة', additional_keywords: ['ديكورات جدة', 'ديكورات جده'], added: '2026-01-05', assigned_to: null, expected: null },
    ]);
  });
});

describe('session: AI usage', () => {
  it('extracts credits left from the usage tooltip HTML', () => {
    const html = '<span data-bs-original-title="14800 (99%) AI credits left out of 15000 AI credits per month in your plan." data-bs-html="true"> 99% monthly AI credits available</span>';
    expect(parseAiUsage(html)).toBe('14800 of 15000 AI credits left');
    expect(parseAiUsage('<b>other</b> text')).toBe('other text');
  });
});
