import { createHash } from 'node:crypto';
import { NeuronWriterError } from '../../../errors.js';
import type { LookupFeatures } from '../../features.js';
import { PAGES } from '../endpoints.js';
import type { SessionCore } from '../SessionCore.js';
import { parseHtmlRows } from '../pageScripts/common.js';

export class SessionLookup implements LookupFeatures {
  constructor(private readonly core: SessionCore) {}

  async locations(projectId: string, query: string, engine: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.project(projectId), signal);
    const data = await this.core.post(page, 'geolocationList', { q: query, engine }, signal);
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    return items.map((item) => ({ id: String(item.id ?? ''), name: String(item.text ?? '') })).filter((l) => l.id);
  }

  async urlKeywords(projectId: string, url: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.project(projectId), signal);
    const data = await this.core.post(page, 'urlTopKeywords', { target_url: url, project: projectId }, signal);
    if (!data.keywords_table) throw new NeuronWriterError('No Search Console data for this URL.', 'Connect Google Search Console to the project in NeuronWriter (project menu → Search Console), then retry.');
    const rows = await page.evaluate(parseHtmlRows, { html: String(data.keywords_table), selector: 'tbody tr' });
    return rows.map((r) => ({ text: r.text, cells: r.cells }));
  }

  async suggestTargetUrl(projectId: string, keyword: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.project(projectId), signal);
    const data = await this.core.post(page, 'suggestTargetUrl', { project: projectId, keyword, mode: 'analysis' }, signal);
    const rows = await page.evaluate(parseHtmlRows, { html: String(data.content_options ?? ''), selector: 'option, li, tr' });
    return [...new Set(rows.flatMap((r) => (r.links.length ? r.links : [r.text])).filter((t) => /^https?:\/\//.test(t)))];
  }

  async hubPages(projectId: string, url: string, signal?: AbortSignal) {
    const page = await this.core.open(PAGES.project(projectId), signal);
    // The inventory keys URLs by their MD5.
    const data = await this.core.post(page, 'hubPages', { url_md5: createHash('md5').update(url).digest('hex'), project: projectId }, signal);
    const rows = await page.evaluate(parseHtmlRows, { html: String(data.hubs_table ?? ''), selector: 'tbody tr' });
    return rows.map((r) => ({ text: r.text, cells: r.cells }));
  }
}
