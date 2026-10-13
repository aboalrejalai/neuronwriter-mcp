import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountStatus, AiRequest, AiResult, Backend, CompetitorSelection, ContentInput, ContentPlanIdea, ContentRevision, CreateQueryInput, PageContent, Project, ProjectSettings, ProjectSettingsPatch, QuerySummary, Recommendations, Score } from '../src/backends/Backend.js';
import { PlanLimitError, SessionExpiredError } from '../src/errors.js';
import type { SessionFeatures } from '../src/backends/features.js';
import { createServer } from '../src/server.js';

const ARABIC_HTML = '<h1>ديكورات مكة</h1><p>دليل شامل لتحويل منزلك إلى تحفة فنية عصرية ‎– مع أفضل معلم ديكورات.</p>';

class FakeBackend implements Backend {
  readonly name = 'session' as const;
  calls: string[] = [];
  failWith: Error | null = null;
  queries: QuerySummary[] = [
    { id: 'c1f8fbd2b38960d3', keyword: 'ديكورات مكة', created: null, engine: 'SA', content_score: 9, word_count: 409, tags: [], url: 'https://app.neuronwriter.com/analysis/view/c1f8fbd2b38960d3' },
    ...Array.from({ length: 30 }, (_, i) => ({ id: i.toString(16).padStart(16, '0'), keyword: `keyword ${i}`, created: null, engine: 'US', content_score: i, word_count: 100, tags: i % 2 ? ['odd'] : [], url: '' })),
  ];

  features: SessionFeatures | undefined = {
    analysis: {
      setDone: (q, done) => this.setDone(q, done),
      setTags: (p, q, tags) => this.setTags(p, q, tags),
      selectCompetitors: (q, sel) => this.selectCompetitors(q, sel),
      fetchPage: (q, url) => this.fetchPage(q, url),
      updateTerms: async (_q, change) => void this.track(`updateTerms:${JSON.stringify(change)}`),
      updateAnalysis: async (_q, patch) => void this.track(`updateAnalysis:${Object.keys(patch).join(',')}`),
    },
    ai: {
      generate: (target, req) => this.generateAi(target.query ?? target.project ?? '', req),
      listTemplates: async () => [],
      saveTemplate: async (_q, t) => [{ ...t, sig: 'tpl1' }],
      deleteTemplate: async () => [],
    },
    planning: {
      listContentPlan: () => this.listContentPlan(),
      addContentPlanIdea: (p, k, a) => this.addContentPlanIdea(p, k, a),
      deleteContentPlanIdea: async (_p, id) => void (this.ideas = this.ideas.filter((i) => i.id !== id)),
      updateContentPlanIdea: async (_p, id, field, value) => void this.track(`cp:${id}:${field}:${value}`),
      listCalendar: async (_p, from, to) => [{ id: 't1', type: 'task', title: `${from}..${to}`, start: from, end: null, status: 'New' }],
      getTask: async (_p, id) => ({ task_id: id, title: 'T', keyword: '', url: '', analysis: '', assigned_to: '', start_date: '', due_date: '', status: 'New', details: '', cost: '', supplemental_keywords: '', tags: '', groups: '' }),
      saveTask: async (_p, task) => void this.track(`saveTask:${task.task_id ?? 'new'}:${task.title ?? ''}`),
    },
    visibility: {
      overview: async () => ({ available: true, message: null, brands: ['أطلالة نجد'], prompts_used: 0, prompts_available: 5, initialization: null, prompts: [] }),
      promptDetails: async () => 'details',
      setBrands: async (_p, b) => void this.track(`brands:${b.join('|')}`),
      addPrompts: async (_p, pr) => void this.track(`prompts:${pr.length}`),
      deletePrompt: async (_p, id) => void this.track(`deletePrompt:${id}`),
    },
    projects: {
      getSettings: () => this.getProjectSettings(),
      updateSettings: (p, patch) => this.updateProjectSettings(p, patch),
      create: async (input) => {
        this.track(`createProject:${input.domain_or_name}`);
        return { project_id: 'aaaaaaaaaaaaaaaa', homepage: `https://${input.domain_or_name}`, engine: input.engine ?? 'google.com', language: input.language ?? 'English' };
      },
    },
  };

  private track(name: string) {
    this.calls.push(name);
    if (this.failWith) throw this.failWith;
  }
  async status(): Promise<AccountStatus> {
    this.track('status');
    return { backend: 'session', logged_in: true, plan: 'Neuron-Bronze-AppSumo', content_writer: { used: 3, limit: 25 }, ai_credits: { used: 0, limit: 15000 }, projects: { used: 2, limit: 2 }, resets_at: '2026-10-12 17:30 UTC' };
  }
  async listProjects(): Promise<Project[]> {
    this.track('listProjects');
    return [{ id: '6ec9249b8de0a586', name: 'makkahdecorsa.com', language: null, engine: null }];
  }
  async listQueries(): Promise<QuerySummary[]> {
    this.track('listQueries');
    return this.queries;
  }
  async getRecommendations(queryId: string): Promise<Recommendations> {
    this.track('getRecommendations');
    return {
      query_id: queryId, keyword: 'ديكورات مكة', status: 'ready', targets: { word_count: 1034, readability: 20 },
      terms: { content_basic: [{ term: 'مكة', min: 10, max: 32 }], content_extended: Array.from({ length: 80 }, (_, i) => ({ term: `t${i}`, min: 1, max: 1 })), title: [], description: [], h1: [], h2: [], entities: [], excluded: [], custom: { text: [], h1: [], h2: [] }, custom_ranges: {} },
      ideas: { headings: [], questions: [] },
      competitors: Array.from({ length: 27 }, (_, i) => ({ rank: i + 1, url: `https://c${i}.example/`, title: null, content_score: 50, word_count: 900, headings: Array.from({ length: 40 }, (_, j) => ({ level: 2, text: `h${j}` })) })),
    };
  }
  async getContent(queryId: string): Promise<ContentRevision> {
    this.track('getContent');
    return { query_id: queryId, title: 'ديكورات مكة', description: 'وصف', html: ARABIC_HTML, word_count: 12, saved_at: '2026-02-07 20:15' };
  }
  async scoreContent(_q: string, input: ContentInput): Promise<Score> {
    this.track(`scoreContent:${input.html}`);
    return { content_score: 61, word_count: 900, readability: 40, details: null };
  }
  async importContent(_q: string, input: ContentInput): Promise<Score> {
    this.track(`importContent:${input.html}`);
    return { content_score: 61, word_count: 900, readability: 40, details: null };
  }
  async setDone(_q: string, done: boolean): Promise<void> {
    this.track(`setDone:${done}`);
  }
  async createQuery(input: CreateQueryInput): Promise<{ query_id: string | null }> {
    this.track(`createQuery:${input.keyword}`);
    return { query_id: 'abcdefabcdefabcd' };
  }
  async generateAi(_q: string, request: AiRequest): Promise<AiResult> {
    this.track(`generateAi:${request.kind}`);
    return {
      content: '<h2>…</h2>', title: request.kind === 'meta' ? 'عنوان' : null, usage: '120 AI credits used',
      data: request.kind === 'image' ? { format: 'png', base64: Buffer.from('png').toString('base64') } : null,
    };
  }
  async setTags(_p: string, queryId: string, tags: string[]): Promise<void> {
    this.track(`setTags:${tags.join('|')}`);
    const q = this.queries.find((x) => x.id === queryId);
    if (q) q.tags = tags;
  }
  async selectCompetitors(_q: string, selection: CompetitorSelection): Promise<string[]> {
    this.track(`selectCompetitors:${selection.mode}`);
    return selection.mode === 'custom' ? selection.keep_urls : ['https://a.example/'];
  }
  async fetchPage(_q: string, url: string): Promise<PageContent> {
    this.track('fetchPage');
    return { url, title: 'T', description: 'D', html: ARABIC_HTML };
  }
  ideas: ContentPlanIdea[] = [];
  async listContentPlan(): Promise<ContentPlanIdea[]> {
    this.track('listContentPlan');
    return this.ideas;
  }
  async addContentPlanIdea(_p: string, keyword: string, additional: string[]): Promise<void> {
    this.track(`addContentPlanIdea:${keyword}`);
    this.ideas.push({ id: 'x', keyword, additional_keywords: additional, added: null, assigned_to: null, expected: null });
  }
  settings: ProjectSettings = {
    project_id: '6ec9249b8de0a586', mode: 'domain', name: 'makkahdecorsa.com', homepage: 'https://makkahdecorsa.com', engine: 'google.com.sa', language: 'Arabic',
    treat_title_as_h1: false, disable_long_terms: false, keywords: { desired: [], brand: [], negative: [], competitors: [] }, domains: { competitors: [], excluded: [] },
    ai_profile: { overview: '', products_pricing: '', labeling_entities: '', personas: '', brand_voice: '' }, report_contact_info: '',
    wordpress: { user: '', password_set: false, subdirectory: false, subdirectory_url: '' },
  };
  async getProjectSettings(): Promise<ProjectSettings> {
    this.track('getProjectSettings');
    return this.settings;
  }
  async updateProjectSettings(_p: string, patch: ProjectSettingsPatch): Promise<ProjectSettings> {
    this.track(`updateProjectSettings:${Object.keys(patch).join(',')}`);
    this.settings = { ...this.settings, ...patch, ai_profile: { ...this.settings.ai_profile, ...patch.ai_profile } } as ProjectSettings;
    return this.settings;
  }
  async close(): Promise<void> {}
}

let backend: FakeBackend;
let client: Client;

beforeEach(async () => {
  backend = new FakeBackend();
  const server = createServer(backend);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
const text = (result: CallToolResult) => (result.content[0] as { text: string }).text;

describe('tool surface', () => {
  it('exposes the nw_ tools, each with title, long description, output schema and all four annotations', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const core of ['nw_status', 'nw_list_projects', 'nw_create_project', 'nw_list_queries', 'nw_create_query', 'nw_get_recommendations', 'nw_score_content', 'nw_import_content', 'nw_update_terms', 'nw_update_analysis', 'nw_generate_ai']) {
      expect(names).toContain(core);
    }
    expect(new Set(names).size).toBe(names.length);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^nw_[a-z_]+$/);
      expect(tool.title).toBeTruthy();
      expect(tool.description!.split('. ').length).toBeGreaterThanOrEqual(3);
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.inputSchema.additionalProperties).toBe(false);
      const a = tool.annotations!;
      for (const key of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) expect(typeof a[key]).toBe('boolean');
    }
  });

  it('keeps reads and credit-spending tools apart', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of ['nw_status', 'nw_list_projects', 'nw_list_queries', 'nw_get_recommendations', 'nw_get_content', 'nw_score_content', 'nw_fetch_page', 'nw_export_content']) {
      expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
    }
    // Everything that spends credits, uses a plan slot or deletes: not read-only, and gated by confirm.
    for (const name of ['nw_create_query', 'nw_create_project', 'nw_generate_ai', 'nw_check_plagiarism', 'nw_refresh_metrics', 'nw_delete_query']) {
      const tool = byName.get(name)!;
      expect(tool.annotations?.readOnlyHint).toBe(false);
      expect(Object.keys(tool.inputSchema.properties ?? {})).toContain('confirm');
    }
    expect(byName.get('nw_delete_query')?.annotations?.destructiveHint).toBe(true);
  });
});

describe('results', () => {
  it('returns structuredContent plus a text copy', async () => {
    const result = await call('nw_status');
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ plan: 'Neuron-Bronze-AppSumo', content_writer: { used: 3, limit: 25 } });
    expect(text(result)).toContain('22/25 analyses left');
  });

  it('pages and filters queries', async () => {
    const first = await call('nw_list_queries', { project: '6ec9249b8de0a586', limit: 10 });
    expect(first.structuredContent).toMatchObject({ total: 31, has_more: true, next_offset: 10 });
    const filtered = await call('nw_list_queries', { project: '6ec9249b8de0a586', tag: 'odd', limit: 100 });
    expect((filtered.structuredContent as { total: number }).total).toBe(15);
    const arabic = await call('nw_list_queries', { project: '6ec9249b8de0a586', keyword: 'ديكورات' });
    expect((arabic.structuredContent as { queries: unknown[] }).queries).toHaveLength(1);
  });

  it('caps large recommendation lists and reports totals', async () => {
    const result = await call('nw_get_recommendations', { query: 'c1f8fbd2b38960d3' });
    const data = result.structuredContent as { terms: { content_extended: unknown[]; content_extended_total: number }; competitors: unknown[]; competitors_total: number };
    expect(data.terms.content_extended).toHaveLength(60);
    expect(data.terms.content_extended_total).toBe(80);
    expect(data.competitors).toHaveLength(10);
    expect(data.competitors_total).toBe(27);
    expect((data.competitors[0] as { headings: unknown[] }).headings).toHaveLength(25);
  });

  it('round-trips Arabic content byte-identical', async () => {
    const got = await call('nw_get_content', { query: 'c1f8fbd2b38960d3' });
    expect((got.structuredContent as { html: string }).html).toBe(ARABIC_HTML);
    await call('nw_import_content', { query: 'c1f8fbd2b38960d3', html: ARABIC_HTML, title: 'ديكورات مكة' });
    expect(backend.calls).toContain(`importContent:${ARABIC_HTML}`);
  });
});

describe('management tools', () => {
  it('hides Done and Deleted analyses by default', async () => {
    backend.queries[1].tags = ['Done'];
    backend.queries[2].tags = ['Optimize', 'Deleted'];
    const active = await call('nw_list_queries', { project: '6ec9249b8de0a586', limit: 100 });
    expect((active.structuredContent as { total: number }).total).toBe(29);
    const deleted = await call('nw_list_queries', { project: '6ec9249b8de0a586', status: 'deleted' });
    expect((deleted.structuredContent as { total: number }).total).toBe(1);
  });

  it('adds and removes tags without touching the others', async () => {
    backend.queries[0].tags = ['Optimize', 'Deleted'];
    const result = await call('nw_update_tags', { project: '6ec9249b8de0a586', query: 'c1f8fbd2b38960d3', add: ['Improve'], remove: ['deleted'] });
    expect(result.structuredContent).toMatchObject({ tags: ['Optimize', 'Improve'] });
  });

  it('needs keep_urls for a custom competitor set', async () => {
    expect((await call('nw_select_competitors', { query: 'c1f8fbd2b38960d3', mode: 'custom' })).isError).toBe(true);
    const ok = await call('nw_select_competitors', { query: 'c1f8fbd2b38960d3', mode: 'top30' });
    expect(ok.structuredContent).toMatchObject({ selected: ['https://a.example/'] });
  });

  it('fetches and scores a page', async () => {
    const result = await call('nw_fetch_page', { query: 'c1f8fbd2b38960d3', url: 'https://makkahdecorsa.com/' });
    expect(result.structuredContent).toMatchObject({ html: ARABIC_HTML, score: { content_score: 61 } });
  });

  it('updates only the settings passed', async () => {
    const result = await call('nw_update_project_settings', { project: '6ec9249b8de0a586', ai_profile: { brand_voice: 'ودود' } });
    expect(backend.calls).toContain('updateProjectSettings:ai_profile');
    expect(result.structuredContent).toMatchObject({ name: 'makkahdecorsa.com', ai_profile: { brand_voice: 'ودود', overview: '' } });
    expect((await call('nw_update_project_settings', { project: '6ec9249b8de0a586' })).isError).toBe(true);
  });

  it('validates term changes before touching NeuronWriter', async () => {
    const missing = await call('nw_update_terms', { query: 'c1f8fbd2b38960d3', action: 'set_range', term: 'مكة', min: 3 });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain('needs max');
    expect((await call('nw_update_terms', { query: 'c1f8fbd2b38960d3', action: 'set_range', term: 'مكة', min: 9, max: 3 })).isError).toBe(true);
    expect(backend.calls).toEqual([]);
    await call('nw_update_terms', { query: 'c1f8fbd2b38960d3', action: 'add', terms: ['بريدة'], location: 'h2' });
    expect(backend.calls).toContain('updateTerms:{"action":"add","terms":["بريدة"],"location":"h2"}');
  });

  it('updates only the analysis fields passed', async () => {
    expect((await call('nw_update_analysis', { query: 'c1f8fbd2b38960d3' })).isError).toBe(true);
    expect((await call('nw_update_analysis', { query: 'c1f8fbd2b38960d3', deadline: '13/10/2026' })).isError).toBe(true);
    const result = await call('nw_update_analysis', { query: 'c1f8fbd2b38960d3', target_word_count: 900, deadline: '2026-10-20' });
    expect(result.structuredContent).toMatchObject({ changed: ['target_word_count', 'deadline'] });
  });

  it('creates a project only with confirm', async () => {
    const refused = await call('nw_create_project', { mode: 'domain', domain_or_name: 'atalanajd.com' });
    expect(refused.isError).toBe(true);
    expect(backend.calls).toEqual([]);
    const created = await call('nw_create_project', { mode: 'domain', domain_or_name: 'atalanajd.com', engine: 'google.com.sa', language: 'Arabic', confirm: true });
    expect(created.structuredContent).toMatchObject({ project_id: 'aaaaaaaaaaaaaaaa', engine: 'google.com.sa' });
  });

  it('adds and deletes content plan ideas', async () => {
    const result = await call('nw_update_content_plan', { project: '6ec9249b8de0a586', action: 'add', keyword: 'بديل الرخام مكة', additional_keywords: ['بديل الرخام'] });
    expect(result.structuredContent).toMatchObject({ ideas: [{ keyword: 'بديل الرخام مكة', additional_keywords: ['بديل الرخام'] }] });
    expect((await call('nw_update_content_plan', { project: '6ec9249b8de0a586', action: 'deadline', idea_id: 'x', value: '20/10' })).isError).toBe(true);
    const deleted = await call('nw_update_content_plan', { project: '6ec9249b8de0a586', action: 'delete', idea_id: 'x' });
    expect(deleted.structuredContent).toMatchObject({ ideas: [] });
  });

  it('reads planning parts and saves tasks', async () => {
    const cal = await call('nw_get_project_data', { project: '6ec9249b8de0a586', part: 'calendar', from: '2026-10-13' });
    expect(cal.structuredContent).toMatchObject({ part: 'calendar', data: [{ title: '2026-10-13..2026-11-12' }] });
    expect((await call('nw_get_project_data', { project: '6ec9249b8de0a586', part: 'task' })).isError).toBe(true);
    const vis = await call('nw_get_project_data', { project: '6ec9249b8de0a586', part: 'ai_visibility' });
    expect(vis.structuredContent).toMatchObject({ data: { prompts_available: 5 } });
    expect((await call('nw_save_task', { project: '6ec9249b8de0a586' })).isError).toBe(true);
    await call('nw_save_task', { project: '6ec9249b8de0a586', title: 'كتابة مقال', due_date: '2026-10-20' });
    expect(backend.calls).toContain('saveTask:new:كتابة مقال');
  });
});

describe('backend without session features', () => {
  it('reports session-only tools as not supported', async () => {
    (backend as { features?: SessionFeatures }).features = undefined;
    const result = await call('nw_set_done', { query: 'c1f8fbd2b38960d3', done: true });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not available on the session backend');
  });
});

describe('errors and safety', () => {
  it('rejects malformed ids as an actionable tool error', async () => {
    const result = await call('nw_get_content', { query: '../../backend/delete-project' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('16 lowercase hex characters');
    expect(backend.calls).toEqual([]);
  });

  it('rejects unknown arguments', async () => {
    const result = await call('nw_status', { surprise: true });
    expect(result.isError).toBe(true);
  });

  it('turns an expired session into a next step', async () => {
    backend.failWith = new SessionExpiredError();
    const result = await call('nw_list_projects');
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('npm run login');
  });

  it('passes plan-limit messages through', async () => {
    backend.failWith = new PlanLimitError('The analysis exceeds the number of keyword analyses available for this month.');
    const result = await call('nw_status');
    expect(text(result)).toContain('exceeds the number of keyword analyses');
    expect(text(result)).toContain('Next step');
  });

  it('returns an existing analysis instead of spending a credit', async () => {
    const result = await call('nw_create_query', { project: '6ec9249b8de0a586', keyword: '  ديكورات   مكة ', engine: 'google.com.sa', language: 'Arabic', confirm: true });
    expect(result.structuredContent).toMatchObject({ query_id: 'c1f8fbd2b38960d3', existing: true, spent_analysis: false });
    expect(backend.calls.some((c) => c.startsWith('createQuery'))).toBe(false);
  });

  it('refuses to spend an analysis without confirm', async () => {
    const result = await call('nw_create_query', { project: '6ec9249b8de0a586', keyword: 'new keyword', engine: 'google.com', language: 'English' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('ask for approval');
    expect(backend.calls.some((c) => c.startsWith('createQuery'))).toBe(false);
  });

  it('creates the analysis once confirmed', async () => {
    const result = await call('nw_create_query', { project: '6ec9249b8de0a586', keyword: 'new keyword', engine: 'google.com', language: 'English', confirm: true });
    expect(result.structuredContent).toMatchObject({ query_id: 'abcdefabcdefabcd', existing: false, spent_analysis: true });
  });

  it('rejects keywords with characters NeuronWriter forbids', async () => {
    const result = await call('nw_create_query', { project: '6ec9249b8de0a586', keyword: 'running:shoes', engine: 'google.com', language: 'English', confirm: true });
    expect(result.isError).toBe(true);
    expect(backend.calls).toEqual([]);
  });

  it('refuses AI generation without confirm', async () => {
    const result = await call('nw_generate_ai', { query: 'c1f8fbd2b38960d3', kind: 'outline' });
    expect(result.isError).toBe(true);
    expect(backend.calls).toEqual([]);
    const confirmed = await call('nw_generate_ai', { query: 'c1f8fbd2b38960d3', kind: 'meta', confirm: true });
    expect(confirmed.structuredContent).toMatchObject({ kind: 'meta', title: 'عنوان', usage: '120 AI credits used' });
  });

  it('checks scope and required inputs per kind before spending', async () => {
    expect(text(await call('nw_generate_ai', { kind: 'meta', confirm: true }))).toContain('works on an analysis');
    expect(text(await call('nw_generate_ai', { kind: 'suggest_brands', query: 'c1f8fbd2b38960d3', confirm: true }))).toContain('works on a project');
    expect(text(await call('nw_generate_ai', { kind: 'product_description', query: 'c1f8fbd2b38960d3', confirm: true }))).toContain('needs product_name');
    expect(text(await call('nw_generate_ai', { kind: 'insert_terms', query: 'c1f8fbd2b38960d3', html: '<p>x</p>' }))).toContain('2000');
    expect(backend.calls).toEqual([]);
  });

  it('saves generated images as files', async () => {
    process.env.NW_EXPORT_DIR = (await import('node:os')).tmpdir() + '/nw-test-images';
    const result = await call('nw_generate_ai', { kind: 'image', query: 'c1f8fbd2b38960d3', idea: 'فيلا', title: 'test', confirm: true });
    expect((result.structuredContent as { data: { path: string } }).data.path).toMatch(/nw-test-images\/test.*\.png$/);
  });

  it('requires text for rephrase before spending anything', async () => {
    const result = await call('nw_generate_ai', { query: 'c1f8fbd2b38960d3', kind: 'rephrase', confirm: true });
    expect(result.isError).toBe(true);
    expect(backend.calls).toEqual([]);
  });
});
