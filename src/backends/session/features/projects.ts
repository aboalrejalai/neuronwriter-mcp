import { NeuronWriterError } from '../../../errors.js';
import type { ProjectSettings, ProjectSettingsPatch } from '../../Backend.js';
import type { ProjectFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { applySettingsPatch, toProjectSettings } from '../normalize.js';
import type { SessionCore } from '../SessionCore.js';
import { readProjectSettingsForm } from '../pageScripts/project.js';

export class SessionProjects implements ProjectFeatures {
  constructor(private readonly core: SessionCore) {}

  async getSettings(projectId: string, signal?: AbortSignal): Promise<ProjectSettings> {
    const { form, keywords } = await this.readSettings(projectId, signal);
    return toProjectSettings(projectId, form, keywords);
  }

  async updateSettings(projectId: string, patch: ProjectSettingsPatch, signal?: AbortSignal): Promise<ProjectSettings> {
    const { page, form, keywords } = await this.readSettings(projectId, signal);
    await this.core.post(page, 'updateProjectSettings', { project: projectId, ...applySettingsPatch(form, keywords, patch) }, signal);
    return this.getSettings(projectId, signal);
  }

  /** The settings form (DOM) plus the four keyword lists (endpoint), i.e. everything the Save button sends. */
  private async readSettings(projectId: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.projectSettings(projectId), signal);
    const form = await page.evaluate(readProjectSettingsForm);
    if (!form) throw new NeuronWriterError(`Project ${projectId} settings were not found.`, 'Call nw_list_projects to get valid project ids.');
    const data = await this.core.post(page, 'getProjectSettings', { tab: '', project: projectId }, signal);
    return { page, form, keywords: (data.project_keywords ?? {}) as Record<string, unknown> };
  }
}
