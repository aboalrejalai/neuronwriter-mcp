import { AI_MODELS, type AiKind, type AiRequest, type AiResult } from '../../Backend.js';
import type { AiFeatures } from '../../features.js';
import { parseAiUsage } from '../normalize.js';
import { LONG_TIMEOUT_MS, type SessionCore } from '../SessionCore.js';
import { buildAiBody } from '../pageScripts/ai.js';

/** Templates the web app itself uses for each kind (outline and meta are the Content Designer's). */
const AI_TEMPLATES: Record<AiKind, string> = {
  outline: 'content-designer-blog-outline',
  meta: 'content-designer-meta-title-and-description',
  intro: 'intro-terms',
  paragraph: 'paragraph-heading-terms',
  faq: 'faq-basicterms-extendedterms',
  rephrase: 'basic-rephrase',
  expand: 'basic-expand',
  article: 'one-click-long-form',
};

export class SessionAi implements AiFeatures {
  constructor(private readonly core: SessionCore) {}

  async generate(queryId: string, request: AiRequest, signal?: AbortSignal): Promise<AiResult> {
    const page = await this.core.openAnalysis(queryId, signal);
    const body = await page.evaluate(buildAiBody, {
      template: AI_TEMPLATES[request.kind],
      wizardMode: null,
      title: request.title ?? '',
      text: request.text ?? '',
      heading: request.heading ?? '',
      tone: request.tone ?? '',
      wordCount: request.word_count ?? 300,
      model: AI_MODELS[request.model ?? 'default'],
      html: '',
    });
    const data = await this.core.post(page, 'generateAiContent', body, signal, LONG_TIMEOUT_MS);
    return {
      content: String(data.content ?? ''),
      title: request.kind === 'meta' ? String(data.first_gen_content ?? '') : null,
      usage: parseAiUsage(data.ai_usage_info),
    };
  }
}
