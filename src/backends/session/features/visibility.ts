import { NeuronWriterError } from '../../../errors.js';
import type { VisibilityFeatures, VisibilityOverview } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { htmlToText } from '../normalize.js';
import type { SessionCore } from '../SessionCore.js';
import { readVisibilityPage } from '../pageScripts/project.js';

const DOMAIN_ONLY = 'AI Visibility needs a domain project (Project settings → Definition → Domain-related project).';

export class SessionVisibility implements VisibilityFeatures {
  constructor(private readonly core: SessionCore) {}

  async overview(projectId: string, signal?: AbortSignal): Promise<VisibilityOverview> {
    const page = await this.core.open(PAGES.aiTracker(projectId), signal);
    const raw = await page.evaluate(readVisibilityPage);
    if (raw.domainOnly) {
      return { available: false, message: DOMAIN_ONLY, brands: [], prompts_used: null, prompts_available: null, initialization: null, prompts: [] };
    }
    const init = await this.core.post(page, 'trackerInitStatus', { project: projectId }, signal).catch(() => null);
    return {
      available: true,
      message: null,
      brands: raw.brands.split('\n').map((b) => b.trim()).filter(Boolean),
      prompts_used: raw.used,
      prompts_available: raw.available,
      initialization: init ? { progress: typeof init.progress === 'number' ? init.progress : null, description: htmlToText(init.progress_desc) ?? htmlToText(init.subheading) } : null,
      prompts: raw.prompts.map((p) => ({ id: p.id, prompt: p.text, details: '' })),
    };
  }

  async promptDetails(projectId: string, promptId: string, view: 'overview' | 'earn-mention', signal?: AbortSignal): Promise<string> {
    const page = await this.core.open(PAGES.aiTracker(projectId), signal);
    const data = await this.core.post(page, 'trackerPromptDetails', { project: projectId, prompt: promptId, view }, signal);
    return htmlToText(data.html) ?? '';
  }

  async setBrands(projectId: string, brands: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.requireDomain(projectId, signal);
    await this.core.post(page, 'trackerSaveSettings', { project: projectId, project_brands: brands.slice(0, 10).join('\n') }, signal);
  }

  async addPrompts(projectId: string, prompts: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.requireDomain(projectId, signal);
    await this.core.post(page, 'trackerAddPrompts', { project: projectId, prompts }, signal);
  }

  async deletePrompt(projectId: string, promptId: string, signal?: AbortSignal): Promise<void> {
    const page = await this.requireDomain(projectId, signal);
    await this.core.post(page, 'trackerDeletePrompt', { project: projectId, prompt: promptId }, signal);
  }

  private async requireDomain(projectId: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.aiTracker(projectId), signal);
    if ((await page.evaluate(readVisibilityPage)).domainOnly) throw new NeuronWriterError(DOMAIN_ONLY, 'Use a domain project.');
    return page;
  }
}
