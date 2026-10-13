import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AI_KINDS, AI_MODELS, AI_PROJECT_KINDS, AI_TONES, type AiKind, type AiRequest, type Backend } from '../backends/Backend.js';
import { ConfirmationRequiredError, NwError } from '../errors.js';
import { writeExport } from '../files.js';
import { confirm, handle, ok, projectId, queryId, requireSession } from './shared.js';

const KIND_HELP = [
  'Writing (analysis): outline (H1-H3 from terms + competitor outlines), meta (SEO title + description), intro, paragraph (needs heading), faq, rephrase/expand (need text), article (one-click long form),',
  'titles, product_description (product_name), category_description (category_name), product_reviews, content_plan_keywords, topical_map (keywords), youtube_description (video_title), email (text = bullet points), synonyms (term).',
  'Editing (analysis): prompt (free instruction over html/text), insert_terms (adds missing terms into html, ~2000 credits), ai_score (AI content score of html), facts (from competitor sources, ~5000 credits),',
  'internal_links (AI link suggestions for html), image_ideas, image (idea, ratio, style; saved as a file), designer_article (full Content Designer article from an outline in html), custom (your template_sig).',
  'Project: ai_profile (urls → the 5 AI Profile texts, not saved), suggest_brands, suggest_prompts (url), readiness_audit (url), earn_mention (url), earn_mention_rewrite (url, original_content).',
].join(' ');

/** Required inputs per kind, checked before anything is spent. */
const REQUIRED: Partial<Record<AiKind, Array<keyof AiRequest>>> = {
  paragraph: ['heading'],
  rephrase: ['text'],
  expand: ['text'],
  product_description: ['product_name'],
  category_description: ['category_name'],
  youtube_description: ['video_title'],
  synonyms: ['term'],
  prompt: ['prompt'],
  insert_terms: ['html'],
  ai_score: ['html'],
  internal_links: ['html'],
  image: ['idea'],
  designer_article: ['html'],
  custom: ['template_sig'],
  ai_profile: ['urls'],
  suggest_prompts: ['url'],
  readiness_audit: ['url'],
  earn_mention: ['url'],
  earn_mention_rewrite: ['url', 'original_content'],
};

const PROJECT_KINDS = new Set<string>(AI_PROJECT_KINDS);
const words = z.array(z.string().min(1).max(200)).max(50);

export function registerAiTools(server: McpServer, backend: Backend): void {
  server.registerTool(
    'nw_generate_ai',
    {
      title: "NeuronWriter's AI (spends AI credits)",
      description:
        "Runs NeuronWriter's own AI on an analysis (query) or a project, with the same templates and inputs as the web app, so writing already targets the analysis terms. It SPENDS AI credits (15,000 a month on the Bronze plan; most kinds ~100, heavy ones say so). " +
        `Kinds — ${KIND_HELP} ` +
        'Requires confirm: true, which you may only set after the user approved the spend in this conversation. Nothing is saved to NeuronWriter: put text into the article and save with nw_import_content, AI Profile texts with nw_update_project_settings. Session backend only.',
      inputSchema: z.strictObject({
        kind: z.enum(AI_KINDS),
        query: queryId.optional().describe('Analysis for analysis-scoped kinds.'),
        project: projectId.optional().describe('Project for project-scoped kinds.'),
        title: z.string().max(300).optional(),
        text: z.string().max(4000).optional().describe('Text to rewrite, or bullet points.'),
        heading: z.string().max(300).optional(),
        html: z.string().max(400_000).optional().describe('HTML to work on (insert_terms, ai_score, internal_links, prompt) or the outline (designer_article).'),
        description: z.string().max(2000).optional(),
        prompt: z.string().max(1000).optional(),
        keywords: words.optional(),
        product_name: z.string().max(200).optional(),
        category_name: z.string().max(200).optional(),
        video_title: z.string().max(200).optional(),
        term: z.string().max(200).optional(),
        sources: z.array(z.string().url()).max(10).optional().describe('Competitor URLs for facts.'),
        custom_sources: z.string().max(5000).optional(),
        idea: z.string().max(1000).optional(),
        ratio: z.enum(['3:2', '1:1', '2:3']).optional(),
        style: z.enum(['photograph', 'cartoon', 'painting', 'sketch']).optional(),
        template_sig: z.string().max(100).optional(),
        fields: z.record(z.string(), z.string().max(2000)).optional().describe('Variables of a custom template.'),
        urls: z.array(z.string().url()).max(3).optional(),
        url: z.string().url().optional(),
        prompt_type: z.enum(['all', 'research', 'consideration', 'decision']).optional(),
        incentive: z.string().max(500).optional(),
        original_content: z.string().max(20_000).optional(),
        content_type: z.enum(['article', 'landing_page']).optional(),
        content_requirements: z.string().max(2000).optional(),
        use_facts: z.boolean().optional().describe('designer_article: extract facts first (~5000 extra credits).'),
        tone: z.enum(AI_TONES).optional(),
        word_count: z.number().int().min(50).max(5000).optional(),
        model: z.enum(Object.keys(AI_MODELS) as [keyof typeof AI_MODELS, ...Array<keyof typeof AI_MODELS>]).default('default').describe('default = GPT-5 mini (the app default); others may cost more.'),
        confirm,
      }),
      outputSchema: z.object({
        kind: z.string(),
        content: z.string().describe('Generated text/HTML. For "meta" this is the meta description.'),
        title: z.string().nullable().describe('Generated SEO title ("meta").'),
        usage: z.string().nullable().describe('AI credits left, as NeuronWriter reports it.'),
        data: z.record(z.string(), z.unknown()).nullable().describe('Kind-specific output: ideas, brands, prompts, ai_score, the 5 AI Profile texts, image file path…'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const { query, project, confirm: confirmed, ...request } = args;
      const scope = PROJECT_KINDS.has(args.kind) ? 'project' : 'query';
      if (scope === 'project' && !project) throw new NwError(`kind "${args.kind}" works on a project.`, 'Pass project (from nw_list_projects).');
      if (scope === 'query' && !query) throw new NwError(`kind "${args.kind}" works on an analysis.`, 'Pass query (from nw_list_queries).');
      for (const field of REQUIRED[args.kind] ?? []) {
        const value = request[field as keyof typeof request];
        if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
          throw new NwError(`kind "${args.kind}" needs ${String(field)}.`, `Pass ${String(field)}.`);
        }
      }
      if (!confirmed) throw new ConfirmationRequiredError(args.kind === 'insert_terms' ? 'about 2000 AI credits' : args.kind === 'facts' || args.use_facts ? 'about 5000 AI credits' : 'NeuronWriter AI credits');
      const result = await requireSession(backend, 'AI generation').ai.generate({ query, project }, request as AiRequest, extra.signal);
      let data = result.data;
      if (args.kind === 'image' && data?.base64) {
        const path = await writeExport(`${args.title || 'neuronwriter-image'}.${data.format === 'jpeg' ? 'jpg' : data.format}`, Buffer.from(String(data.base64), 'base64'));
        data = { path };
      }
      return ok(`Generated ${args.kind}${result.usage ? ` (${result.usage})` : ''}.`, { kind: args.kind, ...result, data });
    }),
  );

  server.registerTool(
    'nw_manage_ai_templates',
    {
      title: 'List, save or delete your AI templates',
      description:
        "Manages your own NeuronWriter AI templates (prompt + system role + variables), the editor's custom templates: list them, save a new one or update one by sig, or delete one. " +
        'Run a saved template with nw_generate_ai kind "custom" and its template_sig. Templates are account-wide; any analysis id works as the place to manage them. ' +
        'Spends nothing; session backend only.',
      inputSchema: z.strictObject({
        query: queryId.describe('Any analysis (templates are managed from the editor).'),
        action: z.enum(['list', 'save', 'delete']),
        sig: z.string().max(100).optional().describe('For delete, or to update an existing template.'),
        name: z.string().min(1).max(200).optional(),
        prompt: z.string().min(1).max(5000).optional(),
        system_role: z.string().max(2000).optional(),
        notes: z.string().max(2000).optional(),
        fields: z.array(z.string().min(1).max(50)).max(20).optional().describe('Variable names used in the prompt.'),
      }),
      outputSchema: z.object({
        templates: z.array(z.object({ sig: z.string(), name: z.string(), prompt: z.string(), system_role: z.string(), notes: z.string(), fields: z.array(z.string()) })),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    handle(async (args, extra) => {
      const ai = requireSession(backend, 'AI templates').ai;
      let templates;
      if (args.action === 'list') templates = await ai.listTemplates(args.query, extra.signal);
      else if (args.action === 'delete') {
        if (!args.sig) throw new NwError('delete needs sig.', 'List the templates to get it.');
        templates = await ai.deleteTemplate(args.query, args.sig, extra.signal);
      } else {
        if (!args.name || !args.prompt) throw new NwError('save needs name and prompt.', 'Pass name and prompt.');
        templates = await ai.saveTemplate(args.query, { sig: args.sig, name: args.name, prompt: args.prompt, system_role: args.system_role ?? '', notes: args.notes ?? '', fields: args.fields ?? [] }, extra.signal);
      }
      return ok(`${templates.length} template(s).`, { templates });
    }),
  );
}
