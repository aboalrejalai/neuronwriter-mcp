import { NeuronWriterError } from '../../../errors.js';
import type { CompetitorSelection, PageContent } from '../../Backend.js';
import type { AnalysisFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { LONG_TIMEOUT_MS, type SessionCore } from '../SessionCore.js';
import { buildUrlImportBody, readAnalysisSig, readCompetitorSwitches } from '../pageScripts/analysis.js';

export class SessionAnalysis implements AnalysisFeatures {
  constructor(private readonly core: SessionCore) {}

  async setDone(queryId: string, done: boolean, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    await this.core.post(page, done ? 'markContentAsDone' : 'unmarkContentAsDone', { analysis }, signal);
  }

  async setTags(projectId: string, queryId: string, tags: string[], signal?: AbortSignal): Promise<void> {
    const page = await this.core.open(PAGES.project(projectId), signal);
    await this.core.post(page, 'updateTagsStatus', { project: projectId, mode: 'status', object_type: 'analysis', object_id: queryId, value: tags.join(', '), table_pos: null }, signal);
  }

  async selectCompetitors(queryId: string, selection: CompetitorSelection, signal?: AbortSignal): Promise<string[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    if (selection.mode === 'custom') {
      const available = (await page.evaluate(readCompetitorSwitches)).map((c) => c.url);
      const keep = new Set(selection.keep_urls);
      const unknown = selection.keep_urls.filter((url) => !available.includes(url));
      if (unknown.length) throw new NeuronWriterError(`Not competitors of this analysis: ${unknown.join(', ')}`, 'Use URLs exactly as nw_get_recommendations lists them.');
      if (keep.size < 3) throw new NeuronWriterError('Keep at least 3 competitors (NeuronWriter advises 5 or more).', 'Pass more URLs in keep_urls.');
      await this.core.post(page, 'selectCompetitors', { analysis, exclude_choices: available.filter((url) => !keep.has(url)) }, signal);
    } else {
      await this.core.post(page, 'selectCompetitors', { analysis, include_mode: selection.mode === 'top10' ? 'TOP10' : 'TOP30' }, signal);
    }
    const after = await this.core.openAnalysis(queryId, signal);
    return (await after.evaluate(readCompetitorSwitches)).filter((c) => c.selected).map((c) => c.url);
  }

  async fetchPage(queryId: string, url: string, signal?: AbortSignal): Promise<PageContent> {
    const page = await this.core.openAnalysis(queryId, signal);
    const data = await this.core.post(page, 'autoImportContent', await page.evaluate(buildUrlImportBody, { url }), signal, LONG_TIMEOUT_MS);
    const content = (data.content ?? {}) as Record<string, unknown>;
    return { url, title: String(content.title ?? ''), description: String(content.description ?? ''), html: String(content.content ?? '') };
  }
}
