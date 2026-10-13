import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AI_KINDS, AI_MODELS, AI_TONES, type Backend } from '../backends/Backend.js';
import { ConfirmationRequiredError, NwError } from '../errors.js';
import { confirm, handle, ok, queryId, requireSession } from './shared.js';

const KIND_HELP =
  'outline (H1-H3 article outline from the analysis terms and competitor outlines), meta (SEO title + meta description), intro (article intro), ' +
  'paragraph (one section under `heading`), faq, rephrase / expand (rewrite `text`), article (one-click long-form article).';

export function registerAiTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_generate_ai',
    {
      title: "Write with NeuronWriter's AI (spends AI credits)",
      description:
        "Runs NeuronWriter's own AI writer on an analysis, using the same templates as the web app, so the output already targets the analysis terms. It SPENDS AI credits from the monthly allowance (15,000 on the Bronze plan; a long article can take thousands). " +
        `Kinds: ${KIND_HELP} ` +
        'Requires confirm: true, which you may only set after the user approved spending AI credits in this conversation. ' +
        'Nothing is saved: put the result into the article and save with nw_import_content. Session backend only.',
      inputSchema: z.strictObject({
        query: queryId,
        kind: z.enum(AI_KINDS),
        title: z.string().max(200).optional().describe('Article title (defaults to the analysis keyword).'),
        text: z.string().max(4000).optional().describe('Text to rephrase/expand (required for those kinds), or bullet points for intro/paragraph.'),
        heading: z.string().max(200).optional().describe('Section heading (required for kind "paragraph").'),
        tone: z.enum(AI_TONES).optional(),
        word_count: z.number().int().min(50).max(3000).optional().describe('Suggested output length in words (intro, paragraph, faq, rephrase, expand, article).'),
        model: z.enum(Object.keys(AI_MODELS) as [keyof typeof AI_MODELS, ...Array<keyof typeof AI_MODELS>]).default('default').describe('default = the app default (GPT-5 mini); others may cost more credits.'),
        confirm,
      }),
      outputSchema: z.object({
        query_id: z.string(),
        kind: z.string(),
        content: z.string().describe('Generated text or HTML. For kind "meta" this is the meta description.'),
        title: z.string().nullable().describe('Generated SEO title (kind "meta" only).'),
        usage: z.string().nullable().describe('AI credit usage as NeuronWriter reports it.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if ((args.kind === 'rephrase' || args.kind === 'expand') && !args.text) throw new NwError(`kind "${args.kind}" needs text.`, 'Pass the text to rewrite in `text`.');
      if (args.kind === 'paragraph' && !args.heading) throw new NwError('kind "paragraph" needs heading.', 'Pass the section heading in `heading`.');
      if (!args.confirm) throw new ConfirmationRequiredError('NeuronWriter AI credits');
      const result = await requireSession(backend, 'AI generation').ai.generate(args.query, args, extra.signal);
      return ok(`Generated ${args.kind}${result.usage ? ` (${result.usage})` : ''}.`, { query_id: args.query, kind: args.kind, ...result });
    }),
  );
}
