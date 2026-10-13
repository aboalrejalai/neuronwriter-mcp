import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Backend } from './backends/Backend.js';
import { registerAccountTools } from './tools/account.js';
import { registerAiTools } from './tools/ai.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { registerContentTools, registerPageTools } from './tools/content.js';
import { registerMaintenanceTools } from './tools/maintenance.js';
import { registerProjectTools } from './tools/projects.js';
import { registerQueryManagementTools, registerQueryTools } from './tools/queries.js';

export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

const INSTRUCTIONS = `NeuronWriter SEO content tools. Typical workflow:
1. nw_status (session and monthly limits), nw_list_projects, nw_list_queries to find an existing analysis for the keyword (nw_list_content_plan for queued ideas).
2. Only if none exists: nw_create_query (spends 1 monthly analysis; ask the user first, then confirm: true).
3. nw_get_recommendations (wait_seconds: 120 for a new analysis): write so every content_basic term falls in its min-max range, answer the questions, use the competitor outlines, reach the target word count. nw_select_competitors drops irrelevant competitors.
4. Loop nw_score_content until the score beats the best competitor, then nw_import_content to save, then nw_set_done.
To optimize a published page: nw_fetch_page (reads and scores it), improve, score, save.
Tools that spend credits (nw_create_query, nw_generate_ai) require confirm: true after the user approves.`;

export function createServer(backend: Backend): McpServer {
  const server = new McpServer({ name: 'neuronwriter-mcp', version: VERSION }, { instructions: INSTRUCTIONS });
  registerAccountTools(server, backend);
  registerProjectTools(server, backend);
  registerQueryTools(server, backend);
  registerQueryManagementTools(server, backend);
  registerAnalysisTools(server, backend);
  registerContentTools(server, backend);
  registerPageTools(server, backend);
  registerMaintenanceTools(server, backend);
  registerAiTools(server, backend);
  return server;
}
