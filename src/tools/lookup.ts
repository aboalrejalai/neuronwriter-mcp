import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { NwError } from '../errors.js';
import { READ_ONLY, handle, ok, projectId, requireSession } from './shared.js';

export function registerLookupTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_lookup',
    {
      title: 'Look up locations, URL keywords, target pages, hub pages',
      description:
        'Small lookups NeuronWriter offers: locations (city-level targets for nw_create_query, searched by name for an engine), url_keywords (Search Console keywords a page ranks for; needs Search Console connected), ' +
        'suggest_target_url (which page of the project should own a keyword) and hub_pages (pillar pages a URL belongs to). ' +
        'Use locations before creating a city-targeted analysis. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        action: z.enum(['locations', 'url_keywords', 'suggest_target_url', 'hub_pages']),
        query: z.string().min(2).max(100).optional().describe('locations: city name, e.g. "Buraidah" or "بريدة".'),
        engine: z.string().max(40).default('google.com.sa').describe('locations: Google domain.'),
        url: z.string().url().optional().describe('url_keywords, hub_pages'),
        keyword: z.string().max(200).optional().describe('suggest_target_url'),
      }),
      outputSchema: z.object({ action: z.string(), items: z.array(z.unknown()) }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const lookup = requireSession(backend, 'Lookups').lookup;
      const need = (value: unknown, field: string) => {
        if (!value) throw new NwError(`${args.action} needs ${field}.`, `Pass ${field}.`);
        return value as string;
      };
      const items: unknown[] = await {
        locations: () => lookup.locations(args.project, need(args.query, 'query'), args.engine, extra.signal),
        url_keywords: () => lookup.urlKeywords(args.project, need(args.url, 'url'), extra.signal),
        suggest_target_url: () => lookup.suggestTargetUrl(args.project, need(args.keyword, 'keyword'), extra.signal),
        hub_pages: () => lookup.hubPages(args.project, need(args.url, 'url'), extra.signal),
      }[args.action]();
      return ok(`${items.length} result(s).`, { action: args.action, items });
    }),
  );
}
