import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { ConfirmationRequiredError } from '../errors.js';
import { confirm, handle, ok, queryId } from './shared.js';

export function registerAiTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_generate_outline',
    {
      title: "Generate an outline with NeuronWriter's AI (spends AI credits)",
      description:
        "Asks NeuronWriter's own AI writer to generate an article outline for an analysis, using its recommended terms. It SPENDS AI credits from the monthly allowance (15,000 on the Bronze plan). " +
        'Requires confirm: true, which you may only set after the user approved spending AI credits in this conversation. ' +
        'Prefer writing the outline yourself from nw_get_recommendations unless the user asks for NeuronWriter AI. ' +
        'It can take a few minutes. Session backend only; the public API has no AI generation.',
      inputSchema: z.strictObject({ query: queryId, confirm }),
      outputSchema: z.object({ query_id: z.string(), outline: z.string(), ai_credits: z.number().nullable() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      if (!args.confirm) throw new ConfirmationRequiredError('NeuronWriter AI credits');
      const outline = await backend.generateOutline(args.query, extra.signal);
      return ok(`Outline generated${outline.ai_credits !== null ? ` (${outline.ai_credits} AI credits)` : ''}.`, { query_id: args.query, outline: outline.content, ai_credits: outline.ai_credits });
    }),
  );
}
