import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { READ_ONLY, handle, ok } from './shared.js';

const usage = z.object({ used: z.number(), limit: z.number() }).nullable();

export function registerAccountTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_status',
    {
      title: 'NeuronWriter account status',
      description:
        'Checks that the NeuronWriter connection works and returns the plan, monthly usage and the reset date. ' +
        'Call it first in a session, before spending credits, and whenever another tool reports a session or limit problem. ' +
        'Content Writer analyses are the scarce resource (the Bronze plan has 25 per month); AI credits are spent by nw_generate_outline. ' +
        'On the api backend, usage fields are null because the API does not expose them.',
      inputSchema: z.strictObject({}),
      outputSchema: z.object({
        backend: z.enum(['session', 'api']),
        logged_in: z.boolean(),
        plan: z.string().nullable(),
        content_writer: usage.describe('Content Writer analyses used / allowed this month.'),
        ai_credits: usage,
        projects: usage,
        resets_at: z.string().nullable().describe('When monthly limits reset (UTC).'),
      }),
      annotations: READ_ONLY,
    },
    handle(async (_args, extra) => {
      const status = await backend.status(extra.signal);
      const cw = status.content_writer ? `${status.content_writer.limit - status.content_writer.used}/${status.content_writer.limit} analyses left` : 'usage unknown';
      return ok(`Connected (${status.backend} backend). ${status.plan ?? 'Plan unknown'}, ${cw}.`, { ...status });
    }),
  );

  server.registerTool(
    'nw_list_projects',
    {
      title: 'List NeuronWriter projects',
      description:
        'Lists the projects (usually one per website) in the NeuronWriter account with their ids. ' +
        'Use it to find the project id that nw_list_queries and nw_create_query need. ' +
        'It is a cheap read and spends nothing. Language and engine are only filled on the api backend.',
      inputSchema: z.strictObject({}),
      outputSchema: z.object({
        projects: z.array(z.object({ id: z.string(), name: z.string(), language: z.string().nullable(), engine: z.string().nullable() })),
      }),
      annotations: READ_ONLY,
    },
    handle(async (_args, extra) => {
      const projects = await backend.listProjects(extra.signal);
      return ok(`${projects.length} project(s).`, { projects });
    }),
  );
}
