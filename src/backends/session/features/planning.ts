import type { ContentPlanIdea } from '../../Backend.js';
import type { PlanningFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { normalizeContentPlan } from '../normalize.js';
import type { SessionCore } from '../SessionCore.js';
import { readContentPlan } from '../pageScripts/project.js';

export class SessionPlanning implements PlanningFeatures {
  constructor(private readonly core: SessionCore) {}

  async listContentPlan(projectId: string, signal?: AbortSignal): Promise<ContentPlanIdea[]> {
    const page = await this.core.open(PAGES.contentPlan(projectId), signal);
    return normalizeContentPlan(await page.evaluate(readContentPlan));
  }

  async addContentPlanIdea(projectId: string, keyword: string, additionalKeywords: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.core.open(PAGES.contentPlan(projectId), signal);
    await this.core.post(page, 'addToContentPlan', { project: projectId, keyword, additional_keywords: additionalKeywords.join('\n') }, signal);
  }
}
