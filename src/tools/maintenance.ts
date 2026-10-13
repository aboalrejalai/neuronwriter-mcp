import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend, ContentInput } from '../backends/Backend.js';
import { ConfirmationRequiredError, NwError } from '../errors.js';
import { writeExport } from '../files.js';
import { READ_ONLY, confirm, contentFields, handle, ok, projectId, queryId, requireSession } from './shared.js';

const optionalContent = {
  html: contentFields.html.optional().describe('Content to use; defaults to the saved article of the analysis.'),
  title: contentFields.title,
  description: contentFields.description,
};

/** The given content, or the analysis' saved article. */
async function contentOrSaved(backend: Backend, query: string, args: Partial<ContentInput>, signal: AbortSignal): Promise<ContentInput> {
  if (args.html) return { html: args.html, title: args.title, description: args.description };
  const saved = await backend.getContent(query, signal);
  return { html: saved.html, title: args.title ?? saved.title, description: args.description ?? saved.description };
}

export function registerMaintenanceTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_check_plagiarism',
    {
      title: 'Check content for plagiarism',
      description:
        "Runs NeuronWriter's plagiarism check on HTML content, by default the analysis' saved article: unique percentage, matched sentences, number of sources and a link to the details page. " +
        'Use it before publishing content written with AI or from sources. ' +
        'It may use the plan\'s plagiarism quota, so it requires confirm: true after the user agrees. Session backend only.',
      inputSchema: z.strictObject({ query: queryId, ...optionalContent, confirm }),
      outputSchema: z.object({
        query_id: z.string(),
        check_id: z.string().nullable(),
        unique_percent: z.number().nullable(),
        matched_sentences: z.number().nullable(),
        sources: z.number().nullable(),
        details_url: z.string().nullable(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (!args.confirm) throw new ConfirmationRequiredError('a plagiarism check from the plan');
      const content = await contentOrSaved(backend, args.query, args, extra.signal);
      const result = await requireSession(backend, 'Plagiarism checks').analysis.checkPlagiarism(args.query, content, extra.signal);
      return ok(`Unique: ${result.unique_percent ?? '?'}%, ${result.matched_sentences ?? '?'} matched sentence(s) from ${result.sources ?? '?'} source(s).`, { query_id: args.query, ...result });
    }),
  );

  server.registerTool(
    'nw_export_content',
    {
      title: 'Export an article to a Word file',
      description:
        "Exports an article as a DOCX file through NeuronWriter's own exporter (the editor's Export → DOCX), by default the analysis' saved article. " +
        'The file is written to the export folder (NW_EXPORT_DIR, default ~/Downloads/neuronwriter-mcp) and the tool returns its path; nothing in NeuronWriter changes. ' +
        'Use it to hand an article to someone who works in Word. Spends nothing; session backend only.',
      inputSchema: z.strictObject({ query: queryId, ...optionalContent, file_name: z.string().max(120).optional().describe('Without extension; defaults to the title.') }),
      outputSchema: z.object({ query_id: z.string(), path: z.string(), bytes: z.number() }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const content = await contentOrSaved(backend, args.query, args, extra.signal);
      const name = `${args.file_name || content.title || args.query}.docx`;
      const bytes = await requireSession(backend, 'Export').analysis.exportDocx(args.query, content, name, extra.signal);
      const path = await writeExport(name, bytes);
      return ok(`Saved ${path} (${bytes.length} bytes).`, { query_id: args.query, path, bytes: bytes.length });
    }),
  );

  server.registerTool(
    'nw_delete_query',
    {
      title: 'Delete an analysis (restorable)',
      description:
        'Deletes an analysis the way the project list does: it gets the "Deleted" tag and disappears from the active list, but stays restorable with nw_update_tags remove: ["Deleted"]. ' +
        'Use it for duplicates or analyses created by mistake; it does not give the monthly analysis back. ' +
        'Requires confirm: true after the user agrees. Session backend only.',
      inputSchema: z.strictObject({ project: projectId, query: queryId, confirm }),
      outputSchema: z.object({ query_id: z.string(), deleted: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (!args.confirm) throw new ConfirmationRequiredError('nothing, but it deletes the analysis (restorable)');
      await requireSession(backend, 'Deleting analyses').analysis.deleteQuery(args.project, args.query, extra.signal);
      return ok('Deleted. Restore with nw_update_tags remove: ["Deleted"].', { query_id: args.query, deleted: true });
    }),
  );

  server.registerTool(
    'nw_refresh_metrics',
    {
      title: 'Refresh Moz metrics or search volumes',
      description:
        'Asks NeuronWriter to refresh data it shows: "moz" re-downloads Moz authority metrics of the competitors of one analysis; "volume" refreshes search volumes for the whole project\'s language and engine (usually within 5 minutes). ' +
        'Use it when competitor metrics or volumes look stale. ' +
        'Whether the plan meters these refreshes is not documented, so it requires confirm: true after the user agrees. Session backend only.',
      inputSchema: z.strictObject({
        what: z.enum(['moz', 'volume']),
        query: queryId.optional().describe('For "moz".'),
        project: projectId.optional().describe('For "volume".'),
        confirm,
      }),
      outputSchema: z.object({ what: z.string(), target: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const analysis = requireSession(backend, 'Refreshing metrics').analysis;
      if (args.what === 'moz' && !args.query) throw new NwError('"moz" needs query.', 'Pass the analysis id in query.');
      if (args.what === 'volume' && !args.project) throw new NwError('"volume" needs project.', 'Pass the project id in project.');
      if (!args.confirm) throw new ConfirmationRequiredError(`a ${args.what} refresh (metering unknown)`);
      if (args.what === 'moz') {
        await analysis.refreshMoz(args.query!, extra.signal);
        return ok('Moz metrics refreshed. Read nw_get_recommendations again.', { what: 'moz', target: args.query! });
      }
      const targeting = await analysis.refreshVolume(args.project!, extra.signal);
      return ok(`Search volumes for ${targeting} requested; usually ready within 5 minutes.`, { what: 'volume', target: targeting });
    }),
  );
}
