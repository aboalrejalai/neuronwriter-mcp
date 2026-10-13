import { NeuronWriterError, PlanLimitError } from '../../../errors.js';
import type { ProjectSettings, ProjectSettingsPatch } from '../../Backend.js';
import type { NewProjectInput, ProjectFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { applySettingsPatch, htmlToText, toProjectSettings } from '../normalize.js';
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

  /** The app's New project wizard: limit check → domain check (suggests engine/language) → create. */
  async create(input: NewProjectInput, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.home, signal);
    const limit = await this.core.post(page, 'checkProjectLimit', {}, signal);
    if (limit.status !== 'ok') throw new PlanLimitError(htmlToText(limit.error) ?? 'No free project slot on this plan.');
    const probe = await this.core.post(page, 'newProjectDomain', { mode: input.mode, domain: input.domain_or_name }, signal);
    if (probe.status === 'error') throw new NeuronWriterError(htmlToText(probe.error) ?? 'NeuronWriter rejected the domain.', 'Check the domain (e.g. example.com) or use mode "nondomain".');
    const homepage = input.mode === 'domain' ? String(probe.final_url || input.domain_or_name) : input.domain_or_name;
    const engine = input.engine ?? String(probe.suggested_engine || 'google.com');
    const language = input.language ?? String(probe.suggested_lang || 'English');
    const created = await this.core.post(page, 'newProject', {
      mode: input.mode,
      homepage,
      engine,
      language,
      project_keywords: (input.keywords ?? []).join('\n'),
      wizard_ver: 'free',
    }, signal);
    // This endpoint answers with an array: ['success', <project id>] or ['error', <message>].
    const result = Object.values(created);
    if (result[0] !== 'success' || typeof result[1] !== 'string') {
      throw new NeuronWriterError(htmlToText(result[1]) ?? 'NeuronWriter did not create the project.', 'Read the message; check nw_status for free project slots.');
    }
    return { project_id: result[1], homepage, engine, language };
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
