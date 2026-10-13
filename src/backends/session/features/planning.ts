import type { ContentPlanIdea } from '../../Backend.js';
import type { CalendarEntry, PlanningFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { normalizeContentPlan } from '../normalize.js';
import type { SessionCore } from '../SessionCore.js';
import { readContentPlan } from '../pageScripts/project.js';

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

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

  async deleteContentPlanIdea(projectId: string, ideaId: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.open(PAGES.contentPlan(projectId), signal);
    await this.core.post(page, 'deleteFromContentPlan', { project: projectId, cp: ideaId }, signal);
  }

  async updateContentPlanIdea(projectId: string, ideaId: string, field: 'assigned_to' | 'deadline', value: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.open(PAGES.contentPlan(projectId), signal);
    await this.core.post(page, 'updateContentPlanInfo', { project: projectId, mode: field, object_type: 'cp', object_id: ideaId, value }, signal);
  }

  async listCalendar(projectId: string, from: string, to: string, filters: { assigned_to?: string }, signal?: AbortSignal): Promise<CalendarEntry[]> {
    const page = await this.core.open(PAGES.contentManagement(projectId), signal);
    // FullCalendar posts form fields, not JSON.
    const data = await this.core.post(page, 'calendarEvents', {
      project: projectId, filter_t_status: '', filter_t_assigned_to: filters.assigned_to ?? '', start: from, end: to,
    }, signal);
    const events = Array.isArray(data) ? data : Object.values(data);
    return events.map((e) => {
      const event = e as Record<string, unknown>;
      const props = (event.extendedProps ?? {}) as Record<string, unknown>;
      return {
        id: str(props.sig ?? event.id),
        type: str(props.type) || 'task',
        title: str(event.title),
        start: event.start ? str(event.start) : null,
        end: event.end ? str(event.end) : null,
        status: props.status ? str(props.status) : null,
      };
    });
  }
}
