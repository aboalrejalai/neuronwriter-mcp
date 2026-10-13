// Live check of analysis-level tools (plan 002 phases 2–4) on one analysis. Every change is reverted.
// Usage: node scripts/live/phase2-analysis.mjs <queryId> <projectId> [--with-paid]
import { live } from './harness.mjs';
const [Q, P, flag] = process.argv.slice(2);
const paid = flag === '--with-paid';

await live('phase2-analysis', async ({ step, onRevert, log }) => {
  const rec = await step('nw_get_recommendations', { query: Q, max_extended_terms: 5, max_competitors: 3, max_headings_per_competitor: 2 });
  const someTerm = rec?.terms?.content_extended?.[0]?.term ?? rec?.terms?.content_basic?.[0]?.term;
  const basic = rec?.terms?.content_basic?.[0];
  log('targets', JSON.stringify(rec?.targets), '| sample term', someTerm, '| basic', JSON.stringify(basic));

  // Terms: custom add/remove, range set/reset, exclude/reinclude, negative filter on/off
  await step('nw_update_terms', { query: Q, action: 'add', terms: ['اختبار مخصص'], location: 'text' });
  onRevert(() => step('nw_update_terms', { query: Q, action: 'remove', term: 'اختبار مخصص', location: 'text' }));
  if (basic) {
    await step('nw_update_terms', { query: Q, action: 'set_range', term: basic.term, min: (basic.min ?? 1) + 1, max: (basic.max ?? 5) + 1 });
    onRevert(() => step('nw_update_terms', { query: Q, action: 'reset_range', term: basic.term }));
  }
  if (someTerm) {
    await step('nw_update_terms', { query: Q, action: 'exclude', term: someTerm });
    onRevert(() => step('nw_update_terms', { query: Q, action: 'reinclude', term: someTerm }));
  }
  await step('nw_update_terms', { query: Q, action: 'negative_filter', on: true });
  onRevert(() => step('nw_update_terms', { query: Q, action: 'negative_filter', on: false }));
  const after = await step('nw_get_recommendations', { query: Q, max_extended_terms: 0, max_competitors: 0 });
  log('custom', JSON.stringify(after?.terms?.custom), '| excluded', JSON.stringify(after?.terms?.excluded), '| custom_ranges', JSON.stringify(after?.terms?.custom_ranges));

  // Analysis fields
  const target = rec?.targets?.word_count;
  await step('nw_update_analysis', { query: Q, target_word_count: 1200, target_readability: 50, deadline: '2026-10-31', assigned_to: 'Mohammed', target_url: 'https://atalanajd.com/articles/rainwater-drainage' });
  onRevert(() => step('nw_update_analysis', { query: Q, deadline: '', assigned_to: '', target_url: '' }));
  if (target) onRevert(() => step('nw_update_analysis', { query: Q, target_word_count: target, target_readability: rec?.targets?.readability ?? 50 }));
  const changed = await step('nw_get_recommendations', { query: Q, max_extended_terms: 0, max_competitors: 0 });
  log('targets after update', JSON.stringify(changed?.targets));

  // Read-only extras
  await step('nw_get_content', { query: Q });
  await step('nw_score_content', { query: Q, html: '<h1>تصريف مياه الأمطار</h1><p>تصريف مياه الأمطار في بريدة والقصيم.</p>', term_detail: 'gaps' });
  const fetched = await step('nw_fetch_page', { query: Q, url: rec?.competitors?.[0]?.url ?? 'https://atalanajd.com', max_chars: 1000 });
  log('fetched', fetched?.title, '| score', fetched?.score?.content_score, '| gaps', fetched?.score?.terms?.body?.length);
  const docx = await step('nw_export_content', { query: Q, html: '<h1>اختبار</h1><p>تصدير تجريبي.</p>', title: 'اختبار تصدير', file_name: 'nw-export-test' });
  log('docx', JSON.stringify(docx));

  if (paid) {
    await step('nw_check_plagiarism', { query: Q, html: '<p>تصريف مياه الأمطار من أسطح المنازل في بريدة يحتاج ميولًا صحيحة ومزاريب كافية.</p>', confirm: true });
    for (const [kind, extra] of [
      ['intro', {}], ['faq', {}], ['titles', {}], ['synonyms', { term: 'تصريف' }], ['rephrase', { text: 'تصريف مياه الأمطار مهم لحماية المباني.' }],
      ['expand', { text: 'تصريف مياه الأمطار مهم لحماية المباني.' }], ['paragraph', { heading: 'أسباب تجمع مياه الأمطار' }],
      ['prompt', { prompt: 'اكتب جملة واحدة عن أهمية الميول في الأسطح', html: '<p>الأسطح</p>' }], ['ai_score', { html: '<h1>تصريف مياه الأمطار</h1><p>نص قصير.</p>' }],
      ['image_ideas', { title: 'تصريف مياه الأمطار', heading: 'شبكات التصريف' }],
    ]) {
      const r = await step('nw_generate_ai', { query: Q, kind, word_count: 120, confirm: true, ...extra });
      log(kind, '→', JSON.stringify((r?.content ?? '').replace(/\s+/g, ' ').slice(0, 140)), JSON.stringify(r?.data ?? null).slice(0, 160), r?.usage);
    }
  }
});
