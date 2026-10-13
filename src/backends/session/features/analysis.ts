import { NeuronWriterError } from '../../../errors.js';
import { APP_URL, type CompetitorSelection, type ContentInput, type PageContent } from '../../Backend.js';
import type { AnalysisFeatures, AnalysisPatch, Comment, ContentIdea, InternalLink, PlagiarismResult, TermAction } from '../../features.js';
import { PAGES } from '../endpoints.js';
import { LONG_TIMEOUT_MS, type SessionCore } from '../SessionCore.js';
import { buildUrlImportBody, htmlText, readRevisions, isContaduTerm, minimalHtml, readAnalysisSig, readCompetitorSwitches, readProjectSig } from '../pageScripts/analysis.js';
import { readVolumeTargeting } from '../pageScripts/project.js';
import { parseHtmlRows } from '../pageScripts/common.js';

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

  async updateTerms(queryId: string, change: TermAction, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    switch (change.action) {
      case 'add':
        await this.core.post(page, 'addCustomTerm', { terms: change.terms.join('\n'), location: change.location, analysis }, signal);
        return;
      case 'remove':
        await this.core.post(page, 'deleteCustomTerm', { term: change.term, location: change.location, analysis }, signal);
        return;
      case 'set_range':
      case 'reset_range': {
        // NeuronWriter's own terms and the user's custom terms are stored apart.
        const fromContadu = await page.evaluate(isContaduTerm, change.term);
        const body = change.action === 'set_range'
          ? { from_contadu: fromContadu, analysis, term: change.term, range_min: change.min, range_max: change.max }
          : { from_contadu: fromContadu, analysis, term: change.term, restore_default: true };
        await this.core.post(page, 'updateTermParams', body, signal);
        return;
      }
      case 'exclude':
        await this.core.post(page, 'excludeTerm', { term: change.term, analysis }, signal);
        return;
      case 'reinclude':
        await this.core.post(page, 'excludeTerm', { term: change.term, analysis, mode: 'reinclude' }, signal);
        return;
      case 'negative_filter':
        await this.core.post(page, 'updateExclusionSettings', { exclude_negative: change.on, analysis }, signal);
    }
  }

  async updateAnalysis(queryId: string, patch: AnalysisPatch, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    const project = await page.evaluate(readProjectSig);
    if (patch.target_word_count !== undefined) await this.core.post(page, 'updateTargets', { analysis, target_name: 'target_word_count', target_value: patch.target_word_count }, signal);
    if (patch.target_readability !== undefined) await this.core.post(page, 'updateTargets', { analysis, target_name: 'target_readability', target_value: patch.target_readability }, signal);
    if (patch.target_url !== undefined) await this.core.post(page, 'updateTargetUrl', { target_url: patch.target_url, analysis }, signal);
    for (const mode of ['assigned_to', 'deadline'] as const) {
      if (patch[mode] !== undefined) {
        await this.core.post(page, 'updateManagementInfo', { project, mode, object_type: 'analysis', object_id: analysis, value: patch[mode], table_pos: null }, signal);
      }
    }
    if (patch.distribution !== undefined) await this.core.post(page, 'updateDistribution', { distribution: patch.distribution, analysis }, signal);
  }

  async deleteQuery(projectId: string, queryId: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.open(PAGES.project(projectId), signal);
    await this.core.post(page, 'deleteAnalysis', { table_pos: null, project: projectId, analysis: queryId }, signal);
  }

  async refreshMoz(queryId: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    await this.core.post(page, 'requestMozUpdate', { analysis: await page.evaluate(readAnalysisSig) }, signal, LONG_TIMEOUT_MS);
  }

  async refreshVolume(projectId: string, signal?: AbortSignal): Promise<string> {
    const page = await this.core.open(PAGES.project(projectId), signal);
    const targeting = await page.evaluate(readVolumeTargeting);
    if (!targeting) throw new NeuronWriterError('This project page has no search-volume refresh.', 'Create an analysis in the project first.');
    await this.core.post(page, 'requestVolumeUpdate', { targeting }, signal);
    return targeting;
  }

  async checkPlagiarism(queryId: string, content: ContentInput, signal?: AbortSignal): Promise<PlagiarismResult> {
    const page = await this.core.openAnalysis(queryId, signal);
    const text = await page.evaluate(htmlText, content.html);
    const data = await this.core.post(page, 'checkPlagiarism', {
      analysis: await page.evaluate(readAnalysisSig), text, html: content.html, title: content.title ?? '', description: content.description ?? '',
    }, signal, LONG_TIMEOUT_MS);
    const info = (data.check_info ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
    const checkId = data.check_id ? String(data.check_id) : null;
    return {
      check_id: checkId,
      unique_percent: num(info.PercentUniqueContent),
      matched_sentences: num(info.MatchedSentences),
      sources: num(info.NumberSources),
      details_url: checkId ? `${APP_URL}/analysis/plagiarism-details/${checkId}` : null,
    };
  }

  async exportDocx(queryId: string, content: ContentInput, fileName: string, signal?: AbortSignal): Promise<Uint8Array> {
    const page = await this.core.openAnalysis(queryId, signal);
    const html = await page.evaluate(minimalHtml, content.html);
    const data = await this.core.post(page, 'exportContent', {
      default_fname: fileName, format: 'docx', content: { title: content.title ?? '', description: content.description ?? '', content: html },
    }, signal, LONG_TIMEOUT_MS);
    if (typeof data.download_data !== 'string') throw new NeuronWriterError('NeuronWriter returned no file.', 'Retry once; if it fails again, export from the web editor.');
    return Uint8Array.from(Buffer.from(data.download_data, 'base64'));
  }

  async listRevisions(queryId: string, signal?: AbortSignal) {
    const page = await this.core.openAnalysis(queryId, signal);
    const { revisions } = await page.evaluate(readRevisions);
    return (Array.isArray(revisions) ? revisions : []).map((r) => {
      const label = String((r as unknown[])[1] ?? '');
      return { revision: String((r as unknown[])[0] ?? ''), saved_at: label.replace('[autosave] ', ''), autosave: label.startsWith('[autosave]') };
    });
  }

  async listComments(queryId: string, signal?: AbortSignal): Promise<Comment[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    const rows = await page.evaluate(parseHtmlRows, { html: null, selector: '[id^="comment-wrapper-"]', container: '#user-comments-container' });
    return rows.map((row) => ({ id: row.id.replace('comment-wrapper-', ''), text: row.text, parent_id: null }));
  }

  async addComment(queryId: string, text: string, parentId: string | null, signal?: AbortSignal): Promise<string | null> {
    const page = await this.core.openAnalysis(queryId, signal);
    const data = await this.core.post(page, 'addComment', { comment: text, analysis: await page.evaluate(readAnalysisSig), selection_mode: false, parent_id: parentId }, signal);
    return data.new_comment_id ? String(data.new_comment_id) : null;
  }

  async editComment(queryId: string, commentId: string, text: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    await this.core.post(page, 'editComment', { comment_id: commentId, comment: text, analysis: await page.evaluate(readAnalysisSig) }, signal);
  }

  async setCommentStatus(queryId: string, commentId: string, status: 'resolved' | 'deleted', signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    await this.core.post(page, 'updateCommentStatus', { comment_id: commentId, analysis: await page.evaluate(readAnalysisSig), new_status: status }, signal);
  }

  async internalLinks(queryId: string, signal?: AbortSignal): Promise<InternalLink[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    const data = await this.core.post(page, 'internalLinks', { analysis: await page.evaluate(readAnalysisSig) }, signal, LONG_TIMEOUT_MS);
    const rows = await page.evaluate(parseHtmlRows, { html: String(data.html ?? ''), selector: '[id^="il_"]' });
    return rows.map((row) => ({ id: row.id.replace(/^il_/, ''), text: row.text, urls: row.links, cells: row.cells }));
  }

  async updateInternalLink(queryId: string, linkId: string, change: { status?: '' | 'TODO' | 'In progress' | 'Done'; note?: string }, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    const analysis = await page.evaluate(readAnalysisSig);
    if (change.status !== undefined) await this.core.post(page, 'internalLinkStatus', { analysis, link_id: linkId, status: change.status }, signal);
    if (change.note !== undefined) await this.core.post(page, 'internalLinkComment', { analysis, link_id: linkId, comment: change.note }, signal);
  }

  async contentIdeas(queryId: string, signal?: AbortSignal): Promise<ContentIdea[]> {
    const page = await this.core.openAnalysis(queryId, signal);
    const data = await this.core.post(page, 'contentIdeas', { analysis: await page.evaluate(readAnalysisSig) }, signal, LONG_TIMEOUT_MS);
    const rows = await page.evaluate(parseHtmlRows, { html: String(data.html ?? ''), selector: 'tr, .nar-idea, li' });
    return rows
      .map((row) => {
        const call = row.onclicks.find((o) => o.includes('add_to_content_plan('));
        const config = call ? call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')).trim() : null;
        return { text: row.text, config };
      })
      .filter((idea) => idea.text && idea.config);
  }

  async addIdeaToPlan(queryId: string, config: string, signal?: AbortSignal): Promise<void> {
    const page = await this.core.openAnalysis(queryId, signal);
    // The app passes the button's argument as-is: a JS object literal or a quoted string.
    let parsed: unknown = config;
    try {
      parsed = JSON.parse(config.replace(/^'|'$/g, '"'));
    } catch {
      /* keep the raw string */
    }
    await this.core.post(page, 'addIdeaToPlan', { analysis: await page.evaluate(readAnalysisSig), config: parsed }, signal);
  }
}
