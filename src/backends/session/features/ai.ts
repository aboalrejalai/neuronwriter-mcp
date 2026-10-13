import { NeuronWriterError, NwError } from '../../../errors.js';
import { AI_MODELS, type AiKind, type AiRequest, type AiResult, type AiTemplateKind } from '../../Backend.js';
import type { AiFeatures, AiTarget, CustomTemplate } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { htmlToText, judgeTerms, parseAiUsage } from '../normalize.js';
import { LONG_TIMEOUT_MS, type SessionCore } from '../SessionCore.js';
import { buildAiBody, readAiContext, readCustomTemplates } from '../pageScripts/ai.js';
import { buildCheckReadabilityBody, htmlText, readAnalysisSig, readTermContext } from '../pageScripts/analysis.js';
import type { Page } from 'playwright';

/** Templates the web app itself uses for each writing kind (outline and meta are the Content Designer's). */
const TEMPLATES: Record<AiTemplateKind, string> = {
  outline: 'content-designer-blog-outline',
  meta: 'content-designer-meta-title-and-description',
  intro: 'intro-terms',
  paragraph: 'paragraph-heading-terms',
  faq: 'faq-basicterms-extendedterms',
  rephrase: 'basic-rephrase',
  expand: 'basic-expand',
  article: 'one-click-long-form',
  titles: 'article-titles',
  product_description: 'product-description-heading-terms',
  category_description: 'category-description-heading-terms',
  product_reviews: 'product-reviews-keywords',
  content_plan_keywords: 'content-plan-keywords',
  topical_map: 'topical-map-keywords',
  youtube_description: 'youtube-heading-bullet-points',
  email: 'email-bullet-points',
  synonyms: 'term-synonyms',
};

const PROJECT_KINDS = new Set<AiKind>(['ai_profile', 'suggest_brands', 'suggest_prompts', 'readiness_audit', 'earn_mention', 'earn_mention_rewrite']);

const lines = (list?: string[]) => (list ?? []).join('\n');

/** Template fields beyond the app's autofill, per writing kind. */
function templateFields(request: AiRequest): Record<string, unknown> {
  switch (request.kind) {
    case 'titles':
    case 'product_reviews':
    case 'content_plan_keywords':
    case 'topical_map':
      return { keywords: lines(request.keywords) };
    case 'product_description':
      return { productname: request.product_name ?? '', bulletpoints: request.text ?? '' };
    case 'category_description':
      return { categoryname: request.category_name ?? '', bulletpoints: request.text ?? '' };
    case 'youtube_description':
      return { videotitle: request.video_title ?? '', bulletpoints: request.text ?? '' };
    case 'email':
      return { bulletpoints: request.text ?? '' };
    case 'synonyms':
      return { terms: request.term ?? '', keywordtitle: request.title ?? '' };
    default:
      return {};
  }
}

const result = (content: unknown, data: Record<string, unknown> | null = null, usage: unknown = null, title: string | null = null): AiResult => ({
  content: typeof content === 'string' ? content : '',
  title,
  usage: parseAiUsage(usage),
  data,
});

export class SessionAi implements AiFeatures {
  constructor(private readonly core: SessionCore) {}

  async generate(target: AiTarget, request: AiRequest, signal?: AbortSignal): Promise<AiResult> {
    if (PROJECT_KINDS.has(request.kind)) {
      if (!target.project) throw new NwError(`kind "${request.kind}" works on a project.`, 'Pass project (from nw_list_projects).');
      return this.projectKind(target.project, request, signal);
    }
    if (!target.query) throw new NwError(`kind "${request.kind}" works on an analysis.`, 'Pass query (from nw_list_queries).');
    const page = await this.core.openAnalysis(target.query, signal);
    if (request.kind in TEMPLATES) return this.template(page, TEMPLATES[request.kind as AiTemplateKind], request, signal);
    return this.analysisKind(page, request, signal);
  }

  private async template(page: Page, template: string, request: AiRequest, signal?: AbortSignal, extra: { mode?: string; isCustom?: boolean; fields?: Record<string, unknown> } = {}): Promise<AiResult> {
    const body = await page.evaluate(buildAiBody, {
      template,
      wizardMode: null,
      title: request.title ?? '',
      text: request.text ?? '',
      heading: request.heading ?? '',
      tone: request.tone ?? '',
      wordCount: request.word_count ?? 300,
      model: AI_MODELS[request.model ?? 'default'],
      html: request.html ?? '',
      mode: extra.mode,
      isCustom: extra.isCustom,
      fields: { ...templateFields(request), ...extra.fields },
    });
    const data = await this.core.post(page, 'generateAiContent', body, signal, LONG_TIMEOUT_MS);
    return result(data.content, null, data.ai_usage_info, request.kind === 'meta' ? String(data.first_gen_content ?? '') : null);
  }

  /** Terms still missing or short in `html`, the way the editor's "unused terms" lists see them. */
  private async unusedTerms(page: Page, html: string, signal?: AbortSignal) {
    const check = await this.core.post(page, 'checkReadability', await page.evaluate(buildCheckReadabilityBody, { html, title: '', description: '' }), signal);
    const usage = judgeTerms(await page.evaluate(readTermContext), check);
    const pick = (group: 'basic' | 'extended') => usage.body.filter((t) => t.group === group && (t.status === 'missing' || t.status === 'use_more')).map((t) => t.term);
    return { unused_must_have_terms: pick('basic'), unused_extended_terms: pick('extended') };
  }

  private async analysisKind(page: Page, request: AiRequest, signal?: AbortSignal): Promise<AiResult> {
    const html = request.html ?? '';
    const need = (value: unknown, field: string) => {
      if (!value) throw new NwError(`kind "${request.kind}" needs ${field}.`, `Pass ${field}.`);
    };
    switch (request.kind) {
      case 'prompt':
        need(request.prompt, 'prompt');
        return this.template(page, 'ai-selection', { ...request, text: html || request.text || '' }, signal, { mode: 'ai-selection', fields: { prompt: request.prompt, text: html || request.text || '' } });
      case 'custom':
        need(request.template_sig, 'template_sig');
        return this.template(page, request.template_sig!, request, signal, { isCustom: true, fields: request.fields });
      case 'designer_article': {
        need(html, 'html (the outline, e.g. from kind "outline")');
        let outline = html;
        if (request.use_facts) {
          const facts = await this.analysisKind(page, { ...request, kind: 'facts' }, signal);
          outline = `${outline}\n${facts.content}`;
        }
        const template = request.content_type === 'landing_page' ? 'content-designer-landing-page' : 'content-designer-blog-article';
        return this.template(page, template, { ...request, html: outline }, signal, { fields: { content_requirements: request.content_requirements ?? '' } });
      }
      case 'insert_terms': {
        need(html, 'html');
        const context = await page.evaluate(readAiContext);
        const data = await this.core.post(page, 'autoinsertTerms', {
          ...context, ...(await this.unusedTerms(page, html, signal)), content: html, text: await page.evaluate(htmlText, html),
        }, signal, LONG_TIMEOUT_MS);
        return result(data.content, null, data.ai_usage_info);
      }
      case 'ai_score': {
        need(html, 'html');
        const body = await page.evaluate(buildCheckReadabilityBody, { html, title: request.title ?? '', description: request.description ?? '' });
        const data = await this.core.post(page, 'checkReadabilityAi', body, signal, LONG_TIMEOUT_MS);
        return result(htmlToText(data.ai_score_details) ?? '', { ai_score: data.ai_overall_score ?? null, message: htmlToText(data.ai_score_message), content_score: data.overall_score ?? null }, data.ai_usage_info);
      }
      case 'facts': {
        const context = await page.evaluate(readAiContext);
        const data = await this.core.post(page, 'extractFacts', {
          content: html, sources_selection: request.sources ?? [], custom_sources: request.custom_sources ?? '',
          analysis: context.analysis, language: context.language, content_terms: context.content_terms,
        }, signal, LONG_TIMEOUT_MS);
        const { content, ai_usage_info: usage, ...rest } = data;
        return result(content ?? rest.facts ?? '', rest, usage);
      }
      case 'internal_links': {
        need(html, 'html');
        const context = await page.evaluate(readAiContext);
        const data = await this.core.post(page, 'aiInternalLinks', {
          ...context, ...(await this.unusedTerms(page, html, signal)), content: html, text: await page.evaluate(htmlText, html),
          title: request.title ?? '', description: request.description ?? '',
        }, signal, LONG_TIMEOUT_MS);
        return result(data.new_content, { suggestions: htmlToText(data.suggestions_html) }, data.ai_usage_info);
      }
      case 'image_ideas': {
        const context = await page.evaluate(readAiContext);
        const data = await this.core.post(page, 'aiImageIdeas', {
          project: context.project, analysis: context.analysis, language: context.language, title: request.title ?? '',
          closest_headings: { before_tag: request.heading ? 'h2' : '', after_tag: '', before_h_text: request.heading ?? '', after_h_text: '', before_distance: 0, after_distance: 0 },
          surrounding_text: (request.text ?? '').slice(0, 300),
        }, signal, LONG_TIMEOUT_MS);
        return result('', { ideas: Array.isArray(data.ideas) ? data.ideas : [] }, data.ai_usage_info);
      }
      case 'image': {
        need(request.idea, 'idea (e.g. from kind "image_ideas")');
        const context = await page.evaluate(readAiContext);
        const data = await this.core.post(page, 'aiImage', {
          project: context.project, analysis: context.analysis, language: context.language, title: request.title ?? '',
          idea: request.idea, ratio: request.ratio ?? '3:2', style: request.style ?? 'photograph',
        }, signal, LONG_TIMEOUT_MS);
        const match = String(data.image ?? '').match(/data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/);
        if (!match) throw new NeuronWriterError('NeuronWriter returned no image.', 'Retry with another idea or style.');
        return result('', { format: match[1] === 'jpg' ? 'jpeg' : match[1], base64: match[2] }, data.ai_usage_info);
      }
      default:
        throw new NwError(`Unknown kind "${request.kind}".`, 'Use one of the kinds listed in the tool description.');
    }
  }

  private async projectKind(projectId: string, request: AiRequest, signal?: AbortSignal): Promise<AiResult> {
    const tracker = request.kind !== 'ai_profile';
    const page = await this.core.open(tracker ? PAGES.aiTracker(projectId) : PAGES.projectSettings(projectId), signal);
    const need = (value: unknown, field: string) => {
      if (!value) throw new NwError(`kind "${request.kind}" needs ${field}.`, `Pass ${field}.`);
    };
    switch (request.kind) {
      case 'ai_profile': {
        need(request.urls?.length, 'urls (up to 3)');
        const data = await this.core.post(page, 'extractAiOverview', { project: projectId, urls: lines(request.urls?.slice(0, 3)) }, signal, LONG_TIMEOUT_MS);
        const o = (data.ai_overview ?? {}) as Record<string, unknown>;
        return result('', {
          overview: o.project ?? '', products_pricing: o.product_pricing ?? '', labeling_entities: o.labeling_entities ?? '', personas: o.personas ?? '', brand_voice: o.brand_voice ?? '',
        }, data.ai_usage_info);
      }
      case 'suggest_brands': {
        const data = await this.core.post(page, 'trackerSuggestBrands', { project: projectId }, signal, LONG_TIMEOUT_MS);
        return result('', { brands: Array.isArray(data.brands) ? data.brands : [] }, data.ai_usage_info);
      }
      case 'suggest_prompts': {
        need(request.url, 'url');
        const data = await this.core.post(page, 'trackerSuggestPrompts', { project: projectId, mode: 'url', url: request.url, type: request.prompt_type ?? 'all' }, signal, LONG_TIMEOUT_MS);
        return result('', { prompts: Array.isArray(data.prompts) ? data.prompts : [] }, data.ai_usage_info);
      }
      case 'readiness_audit': {
        need(request.url, 'url');
        const data = await this.core.post(page, 'trackerReadiness', { project: projectId, url: request.url }, signal, LONG_TIMEOUT_MS);
        return result(htmlToText(data.html) ?? '', null, data.ai_usage_info);
      }
      case 'earn_mention': {
        need(request.url, 'url');
        const data = await this.core.post(page, 'trackerMentions', { project: projectId, url: request.url }, signal, LONG_TIMEOUT_MS);
        return result(htmlToText(data.suggestions) ?? '', null, data.ai_usage_info);
      }
      case 'earn_mention_rewrite': {
        need(request.url, 'url');
        need(request.original_content, 'original_content');
        const data = await this.core.post(page, 'trackerRegenerateMention', {
          project: projectId, url: request.url, original_content: request.original_content, incentive: request.incentive ?? '',
        }, signal, LONG_TIMEOUT_MS);
        return result(htmlToText(data.content) ?? '', null, data.ai_usage_info);
      }
      default:
        throw new NwError(`Unknown kind "${request.kind}".`, 'Use one of the kinds listed in the tool description.');
    }
  }

  async listTemplates(queryId: string, signal?: AbortSignal): Promise<CustomTemplate[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    return normalizeTemplates(await page.evaluate(readCustomTemplates));
  }

  async saveTemplate(queryId: string, template: Omit<CustomTemplate, 'sig'> & { sig?: string }, signal?: AbortSignal): Promise<CustomTemplate[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    const data = await this.core.post(page, 'saveCustomTemplate', {
      name: template.name, prompt: template.prompt, systemrole: template.system_role, notes: template.notes, template_fields: template.fields, template_sig: template.sig ?? '',
    }, signal);
    const raw = typeof data.custom_ai_templates_definition === 'string' ? JSON.parse(data.custom_ai_templates_definition) : data.custom_ai_templates_definition;
    return raw ? normalizeTemplates(raw) : this.listTemplates(queryId, signal);
  }

  async deleteTemplate(queryId: string, sig: string, signal?: AbortSignal): Promise<CustomTemplate[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    await page.evaluate(readAnalysisSig);
    await this.core.post(page, 'deleteCustomTemplate', { template_sig: sig }, signal);
    return this.listTemplates(queryId, signal);
  }
}

/** custom_ai_templates_definition: {sig: {name, prompt, systemrole, notes, template_fields|fields}} */
export function normalizeTemplates(raw: unknown): CustomTemplate[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, Record<string, unknown>>).map(([sig, t]) => ({
    sig,
    name: String(t?.name ?? ''),
    prompt: String(t?.prompt ?? ''),
    system_role: String(t?.systemrole ?? t?.system_role ?? ''),
    notes: String(t?.notes ?? ''),
    fields: Array.isArray(t?.template_fields) ? t.template_fields.map(String) : Array.isArray(t?.fields) ? (t.fields as unknown[]).map(String) : [],
  }));
}
