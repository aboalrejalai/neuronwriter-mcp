import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { NwError } from '../errors.js';
import { READ_ONLY, handle, ok, queryId, requireSession } from './shared.js';

export function registerDetailTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_get_analysis_details',
    {
      title: 'Read revisions, comments, internal links or ideas of an analysis',
      description:
        'Reads one part of an analysis: revisions (saved versions with dates; autosaves marked), comments (the editor\'s comment threads), internal_links (pages of your own site NeuronWriter suggests linking to/from) or content_ideas (new content-plan ideas found from this analysis). ' +
        'Use internal_links before publishing, content_ideas to grow the content plan (add one with nw_update_content_plan action "add_idea"). ' +
        'Spends nothing; session backend only.',
      inputSchema: z.strictObject({ query: queryId, part: z.enum(['revisions', 'comments', 'internal_links', 'content_ideas']) }),
      outputSchema: z.object({ query_id: z.string(), part: z.string(), items: z.array(z.record(z.string(), z.unknown())) }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const analysis = requireSession(backend, 'Analysis details').analysis;
      const items: unknown[] = await {
        revisions: () => analysis.listRevisions(args.query, extra.signal),
        comments: () => analysis.listComments(args.query, extra.signal),
        internal_links: () => analysis.internalLinks(args.query, extra.signal),
        content_ideas: () => analysis.contentIdeas(args.query, extra.signal),
      }[args.part]();
      return ok(`${items.length} ${args.part.replace('_', ' ')}.`, { query_id: args.query, part: args.part, items: items as Array<Record<string, unknown>> });
    }),
  );

  server.registerTool(
    'nw_update_comments',
    {
      title: 'Add, reply to, edit, resolve or delete editor comments',
      description:
        "Works with the comment threads of an analysis' editor, the way collaborators leave notes on a draft: add a comment, reply to one (parent_id), edit its text, mark it resolved, or delete it. " +
        'Read them first with nw_get_analysis_details part "comments". Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        action: z.enum(['add', 'reply', 'edit', 'resolve', 'delete']),
        text: z.string().min(1).max(5000).optional(),
        comment_id: z.string().max(100).optional().describe('reply (as parent), edit, resolve, delete'),
      }),
      outputSchema: z.object({ query_id: z.string(), action: z.string(), comment_id: z.string().nullable() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const analysis = requireSession(backend, 'Comments').analysis;
      const needId = () => {
        if (!args.comment_id) throw new NwError(`${args.action} needs comment_id.`, 'Get ids from nw_get_analysis_details part "comments".');
        return args.comment_id;
      };
      const needText = () => {
        if (!args.text) throw new NwError(`${args.action} needs text.`, 'Pass text.');
        return args.text;
      };
      let id: string | null = args.comment_id ?? null;
      if (args.action === 'add') id = await analysis.addComment(args.query, needText(), null, extra.signal);
      else if (args.action === 'reply') id = await analysis.addComment(args.query, needText(), needId(), extra.signal);
      else if (args.action === 'edit') await analysis.editComment(args.query, needId(), needText(), extra.signal);
      else await analysis.setCommentStatus(args.query, needId(), args.action === 'resolve' ? 'resolved' : 'deleted', extra.signal);
      return ok(`Done: ${args.action}.`, { query_id: args.query, action: args.action, comment_id: id });
    }),
  );

  server.registerTool(
    'nw_update_internal_links',
    {
      title: 'Track internal-link suggestions',
      description:
        'Sets the status (TODO, In progress, Done, or "" to clear) and/or a note on an internal-link suggestion of an analysis, the way the editor\'s internal-links table does. ' +
        'Get suggestion ids with nw_get_analysis_details part "internal_links". Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        link_id: z.string().max(100),
        status: z.enum(['', 'TODO', 'In progress', 'Done']).optional(),
        note: z.string().max(1000).optional(),
      }),
      outputSchema: z.object({ query_id: z.string(), link_id: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (args.status === undefined && args.note === undefined) throw new NwError('Nothing to change.', 'Pass status and/or note.');
      await requireSession(backend, 'Internal links').analysis.updateInternalLink(args.query, args.link_id, { status: args.status, note: args.note }, extra.signal);
      return ok('Updated.', { query_id: args.query, link_id: args.link_id });
    }),
  );
}
