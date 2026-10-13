import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import type { TermAction } from '../backends/features.js';
import { NwError } from '../errors.js';
import { handle, ok, queryId, requireSession } from './shared.js';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const term = z.string().min(1).max(200);
const location = z.enum(['text', 'h1', 'h2']).default('text');

export function registerAnalysisTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_update_terms',
    {
      title: 'Tune the terms of an analysis',
      description:
        "Changes which terms an analysis scores against, like the editor's term panel: add your own terms (body, H1 or H2), remove them, set or reset a term's usage range, exclude an irrelevant recommended term (or bring it back), and switch the negative-keywords filter. " +
        'Use it when recommendations include wrong-intent or competitor-brand terms, or when the business needs a term NeuronWriter missed. ' +
        'The score and recommendations change accordingly; read them again with nw_get_recommendations (terms.excluded, terms.custom, terms.custom_ranges). Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        action: z.enum(['add', 'remove', 'set_range', 'reset_range', 'exclude', 'reinclude', 'negative_filter']),
        terms: z.array(term).max(50).optional().describe('For "add".'),
        term: term.optional().describe('For remove, set_range, reset_range, exclude, reinclude.'),
        location: location.describe('For add/remove: where the term counts.'),
        min: z.number().int().min(0).max(500).optional(),
        max: z.number().int().min(0).max(500).optional(),
        on: z.boolean().optional().describe('For "negative_filter": exclude terms that match the project\'s negative keywords.'),
      }),
      outputSchema: z.object({ query_id: z.string(), action: z.string(), done: z.boolean() }),
      annotations: WRITE,
    },
    handle(async (args, extra) => {
      const change = toTermAction(args);
      await requireSession(backend, 'Editing terms').analysis.updateTerms(args.query, change, extra.signal);
      return ok(`Done: ${args.action}. Read nw_get_recommendations to see the effect.`, { query_id: args.query, action: args.action, done: true });
    }),
  );

  server.registerTool(
    'nw_update_analysis',
    {
      title: 'Set targets and management fields of an analysis',
      description:
        "Sets an analysis' word-count and readability targets, its target URL (the page meant to rank), the person assigned, the deadline, and the distribution notes. " +
        'Use targets when the competitor average is not the right goal for this page (for example a service page shorter than blog competitors). ' +
        'Only the fields you pass change. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        target_word_count: z.number().int().min(50).max(20_000).optional(),
        target_readability: z.number().int().min(0).max(100).optional(),
        target_url: z.string().max(2000).optional().describe('Full URL, or "" to clear.'),
        assigned_to: z.string().max(200).optional(),
        deadline: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD, or "" to clear.').optional(),
        distribution: z.string().max(5000).optional().describe('Where the content is distributed (links, notes).'),
      }),
      outputSchema: z.object({ query_id: z.string(), changed: z.array(z.string()) }),
      annotations: WRITE,
    },
    handle(async (args, extra) => {
      const { query, ...patch } = args;
      const changed = Object.keys(patch);
      if (!changed.length) throw new NwError('Nothing to change.', 'Pass at least one field.');
      await requireSession(backend, 'Editing analyses').analysis.updateAnalysis(query, patch, extra.signal);
      return ok(`Updated ${changed.join(', ')}.`, { query_id: query, changed });
    }),
  );
}

function toTermAction(args: { action: string; terms?: string[]; term?: string; location: 'text' | 'h1' | 'h2'; min?: number; max?: number; on?: boolean }): TermAction {
  const need = (value: unknown, field: string) => {
    if (value === undefined) throw new NwError(`action "${args.action}" needs ${field}.`, `Pass ${field}.`);
  };
  switch (args.action) {
    case 'add':
      need(args.terms?.length || undefined, 'terms');
      return { action: 'add', terms: args.terms!, location: args.location };
    case 'remove':
      need(args.term, 'term');
      return { action: 'remove', term: args.term!, location: args.location };
    case 'set_range':
      need(args.term, 'term');
      need(args.min, 'min');
      need(args.max, 'max');
      if (args.min! > args.max!) throw new NwError('min is larger than max.', 'Swap them.');
      return { action: 'set_range', term: args.term!, min: args.min!, max: args.max! };
    case 'negative_filter':
      need(args.on, 'on');
      return { action: 'negative_filter', on: args.on! };
    default:
      need(args.term, 'term');
      return { action: args.action as 'reset_range' | 'exclude' | 'reinclude', term: args.term! };
  }
}
