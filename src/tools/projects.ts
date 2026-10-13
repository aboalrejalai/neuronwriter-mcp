import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { NwError } from '../errors.js';
import { READ_ONLY, handle, ok, projectId, requireSession } from './shared.js';

const lineList = z.array(z.string().min(1).max(300)).max(500);

const settingsShape = {
  project_id: z.string(),
  mode: z.enum(['domain', 'nondomain']),
  name: z.string(),
  homepage: z.string(),
  engine: z.string(),
  language: z.string(),
  treat_title_as_h1: z.boolean(),
  disable_long_terms: z.boolean(),
  keywords: z.object({ desired: z.array(z.string()), brand: z.array(z.string()), negative: z.array(z.string()), competitors: z.array(z.string()) }),
  domains: z.object({ competitors: z.array(z.string()), excluded: z.array(z.string()) }),
  ai_profile: z.object({ overview: z.string(), products_pricing: z.string(), labeling_entities: z.string(), personas: z.string(), brand_voice: z.string() }),
  report_contact_info: z.string(),
  wordpress: z.object({ user: z.string(), password_set: z.boolean(), subdirectory: z.boolean(), subdirectory_url: z.string() }),
};

const ideaShape = z.object({
  id: z.string(),
  keyword: z.string(),
  additional_keywords: z.array(z.string()),
  added: z.string().nullable(),
  assigned_to: z.string().nullable(),
  expected: z.string().nullable(),
});

export function registerProjectTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_get_project_settings',
    {
      title: 'Read project settings',
      description:
        "Returns a project's settings as the Project settings panel shows them: name, homepage/domain, default search engine and language, scoring options, desired/brand/negative/competitor keyword lists, competitor and auto-excluded domains, the AI Profile (overview, products and pricing, labeling and entities, personas, brand voice) and report contact info. " +
        'Use it before changing settings with nw_update_project_settings, or to give the AI writer context about the business. ' +
        'The WordPress application password is never returned, only whether one is set. Spends nothing; session backend only.',
      inputSchema: z.strictObject({ project: projectId }),
      outputSchema: z.object(settingsShape),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const settings = await requireSession(backend, 'Project settings').projects.getSettings(args.project, extra.signal);
      return ok(`Settings of "${settings.name || settings.homepage}" (${settings.engine}, ${settings.language}).`, { ...settings });
    }),
  );

  server.registerTool(
    'nw_update_project_settings',
    {
      title: 'Change project settings',
      description:
        'Changes project settings: name, homepage/domain, default search engine (e.g. google.com.sa) and language (e.g. Arabic), scoring options, keyword lists, competitor and excluded domains, AI Profile texts and report contact info. ' +
        'Pass only what should change; everything else, including WordPress credentials, is read first and saved back unchanged (NeuronWriter saves the whole form at once). Lists you pass replace the whole list. ' +
        'Show the user the change before making it. Returns the settings after saving. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        name: z.string().min(1).max(200).optional(),
        homepage: z.string().max(500).optional().describe('Full URL of the site homepage (domain projects).'),
        engine: z.string().min(4).max(40).optional().describe('Default Google domain, e.g. google.com.sa.'),
        language: z.string().min(2).max(40).optional().describe('Default language name as NeuronWriter lists it, e.g. Arabic.'),
        treat_title_as_h1: z.boolean().optional(),
        disable_long_terms: z.boolean().optional().describe('Do not suggest content terms of 4+ words.'),
        report_contact_info: z.string().max(2000).optional(),
        keywords: z.strictObject({ desired: lineList.optional(), brand: lineList.optional(), negative: lineList.optional(), competitors: lineList.optional() }).optional(),
        domains: z.strictObject({ competitors: lineList.optional(), excluded: lineList.optional() }).optional(),
        ai_profile: z
          .strictObject({
            overview: z.string().max(5000).optional(),
            products_pricing: z.string().max(5000).optional(),
            labeling_entities: z.string().max(5000).optional(),
            personas: z.string().max(5000).optional(),
            brand_voice: z.string().max(5000).optional(),
          })
          .optional(),
      }),
      outputSchema: z.object(settingsShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const { project, ...patch } = args;
      if (Object.keys(patch).length === 0) throw new NwError('Nothing to change.', 'Pass at least one setting to update.');
      const settings = await requireSession(backend, 'Project settings').projects.updateSettings(project, patch, extra.signal);
      return ok(`Saved settings of "${settings.name || settings.homepage}".`, { ...settings });
    }),
  );

  server.registerTool(
    'nw_list_content_plan',
    {
      title: 'List content plan ideas',
      description:
        "Lists the ideas in a project's Content plan: keyword, supporting keywords, date added, person and expected date. " +
        'Use it to pick the next article to write, then create its analysis with nw_create_query (the analysis is what costs credits, not the idea). ' +
        'Spends nothing; session backend only.',
      inputSchema: z.strictObject({ project: projectId }),
      outputSchema: z.object({ project: z.string(), ideas: z.array(ideaShape) }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const ideas = await requireSession(backend, 'The content plan').planning.listContentPlan(args.project, extra.signal);
      return ok(`${ideas.length} idea(s) in the content plan.`, { project: args.project, ideas });
    }),
  );

  server.registerTool(
    'nw_add_content_plan_idea',
    {
      title: 'Add an idea to the content plan',
      description:
        "Adds a keyword idea (with optional supporting keywords) to a project's Content plan, like the plan's \"New idea\" button. " +
        'Use it to queue future articles without spending an analysis; check nw_list_content_plan first to avoid duplicates. ' +
        'Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        keyword: z.string().min(1).max(200),
        additional_keywords: z.array(z.string().min(1).max(200)).max(20).default([]),
      }),
      outputSchema: z.object({ project: z.string(), ideas: z.array(ideaShape) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const planning = requireSession(backend, 'The content plan').planning;
      await planning.addContentPlanIdea(args.project, args.keyword, args.additional_keywords, extra.signal);
      const ideas = await planning.listContentPlan(args.project, extra.signal);
      return ok(`Added "${args.keyword}" to the content plan (${ideas.length} idea(s) now).`, { project: args.project, ideas });
    }),
  );
}
