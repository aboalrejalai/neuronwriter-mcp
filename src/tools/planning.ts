import { createHash } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Backend } from '../backends/Backend.js';
import { NwError } from '../errors.js';
import { READ_ONLY, handle, ok, projectId, requireSession } from './shared.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export function registerPlanningTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_get_project_data',
    {
      title: 'Read project planning data',
      description:
        "Reads one part of a project's planning area: content_plan (ideas with supporting keywords, person, expected date), calendar (Content management: analyses with a deadline and plan ideas with an expected date, in a date range, default the next 30 days), " +
        'ai_visibility (brands, monitored prompts and slots, initialization progress; domain projects only) or ai_visibility_prompt (details of one monitored prompt, by prompt_id). ' +
        'Use it to decide what to write next or to report on progress. Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        part: z.enum(['content_plan', 'calendar', 'ai_visibility', 'ai_visibility_prompt']),
        from: date.optional().describe('calendar: first day (default today).'),
        to: date.optional().describe('calendar: day after the last (default from + 30 days).'),
        assigned_to: z.string().max(200).optional().describe('calendar filter.'),
        prompt_id: z.string().max(100).optional(),
        view: z.enum(['overview', 'earn-mention']).default('overview').describe('ai_visibility_prompt view.'),
      }),
      outputSchema: z.object({ project: z.string(), part: z.string(), data: z.unknown() }),
      annotations: READ_ONLY,
    },
    handle(async (args, extra) => {
      const session = requireSession(backend, 'Project planning data');
      const signal = extra.signal;
      let data: unknown;
      let summary: string;
      switch (args.part) {
        case 'content_plan': {
          const ideas = await session.planning.listContentPlan(args.project, signal);
          [data, summary] = [ideas, `${ideas.length} idea(s) in the content plan.`];
          break;
        }
        case 'calendar': {
          const from = args.from ?? today();
          const entries = await session.planning.listCalendar(args.project, from, args.to ?? plusDays(from, 30), { assigned_to: args.assigned_to }, signal);
          [data, summary] = [entries, `${entries.length} calendar entr${entries.length === 1 ? 'y' : 'ies'}.`];
          break;
        }
        case 'ai_visibility': {
          const overview = await session.visibility.overview(args.project, signal);
          [data, summary] = [overview, overview.available ? `${overview.prompts.length} monitored prompt(s), ${overview.prompts_used ?? '?'}/${overview.prompts_available ?? '?'} slots used.` : overview.message ?? 'Not available.'];
          break;
        }
        case 'ai_visibility_prompt': {
          if (!args.prompt_id) throw new NwError('part "ai_visibility_prompt" needs prompt_id.', 'Get ids from part "ai_visibility".');
          const details = await session.visibility.promptDetails(args.project, args.prompt_id, args.view, signal);
          [data, summary] = [{ details }, `Prompt details (${details.length} characters).`];
          break;
        }
      }
      return ok(summary, { project: args.project, part: args.part, data });
    }),
  );

  server.registerTool(
    'nw_update_content_plan',
    {
      title: 'Add, schedule or delete content plan ideas',
      description:
        "Changes a project's Content plan: add an idea (keyword + supporting keywords), add one of NeuronWriter's ideas found from an analysis (add_idea), set an idea's person or expected date, or delete it. " +
        'Read the plan first with nw_get_project_data part "content_plan" to avoid duplicates and get idea ids. Deleting cannot be undone, so only delete what the user asked for. ' +
        'Spends nothing (the analysis for an idea is created separately with nw_create_query); session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        action: z.enum(['add', 'add_idea', 'assign', 'deadline', 'delete']),
        query: z.string().regex(/^[a-f0-9]{16}$/).optional().describe('add_idea: the analysis the idea came from'),
        config: z.string().max(5000).optional().describe('add_idea: the idea\'s config from nw_get_analysis_details part "content_ideas"'),
        keyword: z.string().min(1).max(200).optional().describe('add'),
        additional_keywords: z.array(z.string().min(1).max(200)).max(20).default([]).describe('add'),
        idea_id: z.string().max(100).optional().describe('assign, deadline, delete'),
        value: z.string().max(200).optional().describe('assign: person; deadline: YYYY-MM-DD or "" to clear.'),
      }),
      outputSchema: z.object({ project: z.string(), ideas: z.array(z.record(z.string(), z.unknown())) }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const planning = requireSession(backend, 'The content plan').planning;
      if (args.action === 'add') {
        if (!args.keyword) throw new NwError('add needs keyword.', 'Pass keyword.');
        await planning.addContentPlanIdea(args.project, args.keyword, args.additional_keywords, extra.signal);
      } else if (args.action === 'add_idea') {
        if (!args.query || !args.config) throw new NwError('add_idea needs query and config.', 'Take both from nw_get_analysis_details part "content_ideas".');
        await requireSession(backend, 'Content ideas').analysis.addIdeaToPlan(args.query, args.config, extra.signal);
      } else {
        if (!args.idea_id) throw new NwError(`${args.action} needs idea_id.`, 'Get ids from nw_get_project_data part "content_plan".');
        if (args.action === 'delete') await planning.deleteContentPlanIdea(args.project, args.idea_id, extra.signal);
        else {
          if (args.value === undefined) throw new NwError(`${args.action} needs value.`, 'Pass value.');
          if (args.action === 'deadline' && args.value && !/^\d{4}-\d{2}-\d{2}$/.test(args.value)) throw new NwError('deadline must be YYYY-MM-DD.', 'Fix the date.');
          await planning.updateContentPlanIdea(args.project, args.idea_id, args.action === 'assign' ? 'assigned_to' : 'deadline', args.value, extra.signal);
        }
      }
      const ideas = await planning.listContentPlan(args.project, extra.signal);
      return ok(`Done (${args.action}). ${ideas.length} idea(s) in the plan.`, { project: args.project, ideas: ideas as unknown as Array<Record<string, unknown>> });
    }),
  );

  server.registerTool(
    'nw_update_ai_visibility',
    {
      title: 'Set up AI Visibility monitoring',
      description:
        'Configures AI Visibility for a domain project: set the brand names to track (up to 10), add prompts to monitor (each uses one of the plan\'s monitored-prompt slots — 5 on Bronze), or delete a monitored prompt to free its slot. ' +
        'Get prompt ideas with nw_generate_ai kind "suggest_prompts" and current state with nw_get_project_data part "ai_visibility". ' +
        'Spends no credits; session backend only.',
      inputSchema: z.strictObject({
        project: projectId,
        action: z.enum(['set_brands', 'add_prompts', 'delete_prompt']),
        brands: z.array(z.string().min(1).max(100)).max(10).optional(),
        prompts: z.array(z.string().min(3).max(500)).max(5).optional(),
        prompt_id: z.string().max(100).optional(),
        prompt_text: z.string().max(500).optional().describe('delete_prompt: the prompt itself, when its id is unknown (the id is the MD5 of the text).'),
      }),
      outputSchema: z.object({ project: z.string(), action: z.string(), done: z.boolean() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const visibility = requireSession(backend, 'AI Visibility').visibility;
      if (args.action === 'set_brands') {
        if (!args.brands?.length) throw new NwError('set_brands needs brands.', 'Pass brands.');
        await visibility.setBrands(args.project, args.brands, extra.signal);
      } else if (args.action === 'add_prompts') {
        if (!args.prompts?.length) throw new NwError('add_prompts needs prompts.', 'Pass prompts.');
        await visibility.addPrompts(args.project, args.prompts, extra.signal);
      } else {
        const id = args.prompt_id ?? (args.prompt_text ? createHash('md5').update(args.prompt_text).digest('hex') : undefined);
        if (!id) throw new NwError('delete_prompt needs prompt_id or prompt_text.', 'Get ids from nw_get_project_data part "ai_visibility".');
        await visibility.deletePrompt(args.project, id, extra.signal);
      }
      return ok(`Done: ${args.action}.`, { project: args.project, action: args.action, done: true });
    }),
  );
}
