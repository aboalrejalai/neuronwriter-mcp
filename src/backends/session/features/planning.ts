import { NeuronWriterError } from '../../../errors.js';
import type { ContentPlanIdea } from '../../Backend.js';
import type { CalendarEntry, PlanningFeatures, Task } from '../../features.js';
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

  async listCalendar(projectId: string, from: string, to: string, filters: { status?: string; assigned_to?: string }, signal?: AbortSignal): Promise<CalendarEntry[]> {
    const page = await this.core.open(PAGES.contentManagement(projectId), signal);
    // FullCalendar posts form fields, not JSON.
    const data = await this.core.post(page, 'calendarEvents', {
      project: projectId, filter_t_status: filters.status ?? '', filter_t_assigned_to: filters.assigned_to ?? '', start: from, end: to,
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

  async getTask(projectId: string, taskId: string, signal?: AbortSignal): Promise<Task> {
    const page = await this.core.open(PAGES.contentManagement(projectId), signal);
    const data = await this.core.post(page, 'getTask', { task: taskId }, signal);
    const t = (data.task ?? {}) as Record<string, unknown>;
    if (!t.task_sig && !t.title) throw new NeuronWriterError(`Task ${taskId} was not found.`, 'List tasks with nw_get_project_data part "tasks".');
    return {
      task_id: str(t.task_sig ?? taskId), title: str(t.title), keyword: str(t.keyword), url: str(t.url), analysis: str(t.analysis),
      assigned_to: str(t.assigned_to), start_date: str(t.start_date), due_date: str(t.due_date), status: str(t.status), details: str(t.details),
      cost: str(t.cost), supplemental_keywords: str(t.supplemental_keywords), tags: str(t.tags), groups: str(t.t_groups),
    };
  }

  async saveTask(projectId: string, task: Partial<Task>, signal?: AbortSignal): Promise<void> {
    const current = task.task_id ? await this.getTask(projectId, task.task_id, signal) : null;
    const merged = { ...current, ...Object.fromEntries(Object.entries(task).filter(([, v]) => v !== undefined)) } as Partial<Task>;
    const page = await this.core.open(PAGES.contentManagement(projectId), signal);
    // Same body create_update_task() sends; object_type/keyword_md5/url_id are empty for a free-standing task.
    await this.core.post(page, 'saveTask', {
      project: projectId, task_sig: merged.task_id ?? '', object_type: '', keyword_md5: '', url_id: '',
      title: merged.title ?? '', keyword: merged.keyword ?? '', url: merged.url ?? '', analysis: merged.analysis ?? '', update_inventory: 0,
      assigned_to: merged.assigned_to ?? '', start_date: merged.start_date ?? '', due_date: merged.due_date ?? '', status: merged.status ?? 'New',
      details: merged.details ?? '', table_pos: null, cost: merged.cost ?? '', supp_keywords: merged.supplemental_keywords ?? '', tags: merged.tags ?? '', t_groups: merged.groups ?? '',
    }, signal);
  }
}
