import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Backend } from './backends/Backend.js';
import { registerAccountTools } from './tools/account.js';
import { registerAiTools } from './tools/ai.js';
import { registerContentTools } from './tools/content.js';
import { registerQueryTools } from './tools/queries.js';

export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

const INSTRUCTIONS = `NeuronWriter SEO content tools. Typical workflow:
1. nw_status (session and monthly limits), nw_list_projects, nw_list_queries to find an existing analysis for the keyword.
2. Only if none exists: nw_create_query (spends 1 monthly analysis; ask the user first, then confirm: true).
3. nw_get_recommendations (wait_seconds: 120 for a new analysis): write so every content_basic term falls in its min-max range, cover headings and entities, reach the target word count.
4. Loop nw_score_content until the score beats the best competitor, then nw_import_content to save, then nw_set_done.
Tools that spend credits (nw_create_query, nw_generate_outline) require confirm: true after the user approves.`;

export function createServer(backend: Backend): McpServer {
  const server = new McpServer({ name: 'neuronwriter-mcp', version: VERSION }, { instructions: INSTRUCTIONS });
  registerAccountTools(server, backend);
  registerQueryTools(server, backend);
  registerContentTools(server, backend);
  registerAiTools(server, backend);
  return server;
}
