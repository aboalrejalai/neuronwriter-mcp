import { setTimeout as sleep } from 'node:timers/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analysisUrl, type Backend, type QuerySummary, type Recommendations } from '../backends/Backend.js';
import { ConfirmationRequiredError, NwError } from '../errors.js';
import { READ_ONLY, UNTRUSTED_NOTE, confirm, handle, ok, projectId, queryId, reportProgress } from './shared.js';

const POLL_INTERVAL_MS = 15_000;

const querySummary = z.object({
  id: z.string(),
  keyword: z.string(),
  created: z.string().nullable(),
  engine: z.string().nullable(),
  content_score: z.number().nullable(),
  word_count: z.number().nullable(),
  tags: z.array(z.string()),
  url: z.string(),
});

const termRange = z.object({ term: z.string(), min: z.number().nullable(), max: z.number().nullable() });

const normalizeKeyword = (keyword: string) => keyword.trim().replace(/\s+/g, ' ').toLowerCase();

export function registerQueryTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_list_queries',
    {
      title: 'List content analyses in a project',
      description:
        'Lists the Content Writer analyses ("queries") of one project: keyword, id, content score, word count, tags and creation date. ' +
        'Use it to find an existing analysis before creating a new one, since creating one spends a monthly analysis. ' +
        'By default analyses tagged Done or Deleted are left out (status: "all" shows everything). Filter with keyword (case-insensitive substring) or tag; results are paged with limit/offset. ' +
        'Spends nothing.',
      inputSchema: z.strictObject({
        project: projectId,
        keyword: z.string().max(200).optional().describe('Only analyses whose keyword contains this text.'),
        tag: z.string().max(100).optional().describe('Only analyses with this tag.'),
        status: z.enum(['active', 'done', 'deleted', 'all']).default('active').describe('active = not tagged Done or Deleted (the app\'s "In progress" view).'),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      }),
      outputSchema: z.object({
        project: z.string(),
        total: z.number(),
        offset: z.number(),
        has_more: z.boolean(),
        next_offset: z.number().nullable(),
        queries: z.array(querySummary),
      }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      let queries: QuerySummary[] = await backend.listQueries(args.project, extra.signal);
      if (args.keyword) queries = queries.filter((q) => normalizeKeyword(q.keyword).includes(normalizeKeyword(args.keyword!)));
      if (args.tag) queries = queries.filter((q) => q.tags.some((t) => t.toLowerCase() === args.tag!.toLowerCase()));
      const has = (q: QuerySummary, tag: string) => q.tags.includes(tag);
      if (args.status === 'active') queries = queries.filter((q) => !has(q, 'Done') && !has(q, 'Deleted'));
      if (args.status === 'done') queries = queries.filter((q) => has(q, 'Done'));
      if (args.status === 'deleted') queries = queries.filter((q) => has(q, 'Deleted'));
      const page = queries.slice(args.offset, args.offset + args.limit);
      const hasMore = args.offset + page.length < queries.length;
      return ok(`${page.length} of ${queries.length} analyses.${hasMore ? ` More with offset ${args.offset + page.length}.` : ''}`, {
        project: args.project,
        total: queries.length,
        offset: args.offset,
        has_more: hasMore,
        next_offset: hasMore ? args.offset + page.length : null,
        queries: page,
      });
    }),
  );

  server.registerTool(
    'nw_get_recommendations',
    {
      title: 'Get SEO recommendations for an analysis',
      description:
        'Returns what an article must contain to rank for the analysis keyword: content terms with min-max usage counts, title/H1/H2/description terms, entities, heading ideas, questions to answer, target word count and readability, and the top competitors with their scores, word counts and H1-H3 outlines. ' +
        'Use it before writing or rewriting content; write so every content_basic term falls inside its range. ' +
        'A freshly created analysis takes about a minute: pass wait_seconds to keep checking until it is ready. Spends nothing. ' +
        UNTRUSTED_NOTE,
      inputSchema: z.strictObject({
        query: queryId,
        wait_seconds: z.number().int().min(0).max(300).default(0).describe('Keep checking up to this many seconds while the analysis is still being prepared.'),
        max_extended_terms: z.number().int().min(0).max(200).default(60).describe('Cap on content_extended terms returned.'),
        max_competitors: z.number().int().min(0).max(30).default(10),
        max_headings_per_competitor: z.number().int().min(0).max(100).default(25).describe('Cap on each competitor\'s H1-H3 outline; 0 leaves outlines out.'),
      }),
      outputSchema: z.object({
        query_id: z.string(),
        keyword: z.string().nullable(),
        status: z.enum(['ready', 'not_ready']),
        url: z.string(),
        targets: z.object({ word_count: z.number().nullable(), readability: z.number().nullable() }),
        terms: z.object({
          content_basic: z.array(termRange).describe('Must-have terms with suggested usage range in the body.'),
          content_extended: z.array(termRange),
          content_extended_total: z.number(),
          title: z.array(z.string()),
          description: z.array(z.string()),
          h1: z.array(z.string()),
          h2: z.array(z.string()),
          entities: z.array(z.string()),
        }),
        ideas: z.object({ headings: z.array(z.string()), questions: z.array(z.string()) }),
        competitors: z.array(z.object({
          rank: z.number(),
          url: z.string(),
          title: z.string().nullable(),
          content_score: z.number().nullable(),
          word_count: z.number().nullable(),
          headings: z.array(z.object({ level: z.number(), text: z.string() })).describe('The competitor page\'s H1-H3 outline.'),
        })),
        competitors_total: z.number(),
      }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const deadline = Date.now() + args.wait_seconds * 1000;
      let recommendations: Recommendations = await backend.getRecommendations(args.query, extra.signal);
      while (recommendations.status !== 'ready' && Date.now() < deadline) {
        const waited = args.wait_seconds - Math.ceil((deadline - Date.now()) / 1000);
        await reportProgress(extra, waited, args.wait_seconds, 'Analysis is still being prepared');
        await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()), undefined, { signal: extra.signal });
        recommendations = await backend.getRecommendations(args.query, extra.signal);
      }
      const { terms, competitors } = recommendations;
      const data = {
        ...recommendations,
        url: analysisUrl(args.query),
        terms: { ...terms, content_extended: terms.content_extended.slice(0, args.max_extended_terms), content_extended_total: terms.content_extended.length },
        competitors: competitors.slice(0, args.max_competitors).map((c) => ({ ...c, headings: c.headings.slice(0, args.max_headings_per_competitor) })),
        competitors_total: competitors.length,
      };
      const summary = recommendations.status === 'ready'
        ? `"${recommendations.keyword ?? args.query}": ${terms.content_basic.length} must-have terms, target ${recommendations.targets.word_count ?? '?'} words, ${competitors.length} competitors.`
        : 'The analysis is not ready yet. Call again with wait_seconds (e.g. 120).';
      return ok(summary, data);
    }),
  );

  server.registerTool(
    'nw_create_query',
    {
      title: 'Create a content analysis (spends 1 analysis)',
      description:
        'Creates a new NeuronWriter Content Writer analysis for a keyword. It SPENDS 1 of the monthly Content Writer analyses (25 per month on the Bronze plan), so first look for an existing analysis with nw_list_queries. ' +
        'If an analysis with the same keyword already exists in the project it is returned instead and nothing is spent, unless force is true. ' +
        'Requires confirm: true, which you may only set after the user approved the cost in this conversation. ' +
        'The analysis takes about a minute to prepare: follow up with nw_get_recommendations and wait_seconds: 120.',
      inputSchema: z.strictObject({
        project: projectId,
        keyword: z
          .string()
          .min(1)
          .max(200)
          .refine((k) => !/[:[\]",]/.test(k), 'NeuronWriter rejects these characters in a keyword: : [ ] " , — use a plain search query.')
          .describe('Search query to rank for, e.g. "ديكورات مكة" or "running shoes".'),
        engine: z.string().min(4).max(40).describe('Google domain for the target market, e.g. google.com.sa (Saudi Arabia) or google.com.'),
        language: z.string().min(2).max(40).describe('Content language name as NeuronWriter lists it, e.g. Arabic or English.'),
        additional_keywords: z.array(z.string().min(1).max(200)).max(20).optional().describe('Supporting keywords, one per item.'),
        force: z.boolean().default(false).describe('Create even if an analysis with the same keyword exists.'),
        confirm,
      }),
      outputSchema: z.object({
        query_id: z.string().nullable(),
        keyword: z.string(),
        url: z.string().nullable(),
        existing: z.boolean().describe('True when an existing analysis was returned and nothing was spent.'),
        spent_analysis: z.boolean(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (!args.force) {
        const existing = (await backend.listQueries(args.project, extra.signal)).find((q) => normalizeKeyword(q.keyword) === normalizeKeyword(args.keyword));
        if (existing) {
          return ok(`An analysis for "${existing.keyword}" already exists (${existing.id}); nothing was spent.`, {
            query_id: existing.id, keyword: existing.keyword, url: existing.url, existing: true, spent_analysis: false,
          });
        }
      }
      if (!args.confirm) throw new ConfirmationRequiredError('1 of the monthly Content Writer analyses');
      const { query_id } = await backend.createQuery(
        { project: args.project, keyword: args.keyword, engine: args.engine, language: args.language, additional_keywords: args.additional_keywords },
        extra.signal,
      );
      const summary = query_id
        ? `Created analysis ${query_id} for "${args.keyword}". Next: nw_get_recommendations with wait_seconds: 120.`
        : `NeuronWriter accepted the analysis for "${args.keyword}" but it is not listed yet. Find it with nw_list_queries in a minute; do not create it again.`;
      return ok(summary, { query_id, keyword: args.keyword, url: query_id ? analysisUrl(query_id) : null, existing: false, spent_analysis: true });
    }),
  );
}

export function registerQueryManagementTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_update_tags',
    {
      title: 'Add or remove tags of an analysis',
      description:
        'Adds and/or removes tags on an analysis in the project list, e.g. Optimize, Improve, Distribute or your own. "Done" and "Deleted" are tags too: removing "Deleted" restores a deleted analysis. ' +
        'The current tags are read first and only the ones you name change. ' +
        'Use nw_set_done for the editor\'s "Mark as done" button instead of the Done tag when the article is finished. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        query: queryId,
        add: z.array(z.string().min(1).max(60).refine((t) => !t.includes(','), 'Tags cannot contain commas.')).max(20).default([]),
        remove: z.array(z.string().min(1).max(60)).max(20).default([]),
      }),
      outputSchema: z.object({ query_id: z.string(), tags: z.array(z.string()) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const current = (await backend.listQueries(args.project, extra.signal)).find((q) => q.id === args.query);
      if (!current) throw new NwError(`Analysis ${args.query} is not in project ${args.project}.`, 'Check the ids with nw_list_queries (status: "all").');
      const remove = new Set(args.remove.map((t) => t.toLowerCase()));
      const tags = [...new Set([...current.tags.filter((t) => !remove.has(t.toLowerCase())), ...args.add])];
      await backend.setTags(args.project, args.query, tags, extra.signal);
      const after = (await backend.listQueries(args.project, extra.signal)).find((q) => q.id === args.query);
      return ok(`Tags: ${after?.tags.join(', ') || '(none)'}.`, { query_id: args.query, tags: after?.tags ?? tags });
    }),
  );

  server.registerTool(
    'nw_select_competitors',
    {
      title: 'Choose which competitors an analysis uses',
      description:
        'Changes the competitor set NeuronWriter computes the recommendations from: the top 10, the top 30, or a custom list of competitor URLs to keep (at least 3, 5+ advised). ' +
        'Use it to drop irrelevant results (directories, social media, marketplaces) so the term ranges reflect real competitors. ' +
        'Recommendations are recalculated afterwards; read them again with nw_get_recommendations. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        mode: z.enum(['top10', 'top30', 'custom']),
        keep_urls: z.array(z.string().url()).max(30).optional().describe('For mode "custom": competitor URLs exactly as nw_get_recommendations lists them.'),
      }),
      outputSchema: z.object({ query_id: z.string(), selected: z.array(z.string()) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (args.mode === 'custom' && !args.keep_urls?.length) throw new NwError('mode "custom" needs keep_urls.', 'Pass the competitor URLs to keep.');
      const selected = await backend.selectCompetitors(
        args.query,
        args.mode === 'custom' ? { mode: 'custom', keep_urls: args.keep_urls! } : { mode: args.mode },
        extra.signal,
      );
      return ok(`${selected.length} competitors selected. Read nw_get_recommendations again for the new ranges.`, { query_id: args.query, selected });
    }),
  );
}
