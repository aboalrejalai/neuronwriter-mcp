// Owner-approved (2026-10-13): the analysis for the test article, from the Atlalat Najd SEO plan
// (~/Desktop/Project/atalanajd/.cursor/plans/002 TASK-023, keyword 3, 480 searches).
import { live } from './harness.mjs';
await live('create-rainwater', async ({ step, log }) => {
  const created = await step('nw_create_query', {
    project: 'c4e17fb2aa86f36b', keyword: 'تصريف مياه الأمطار', engine: 'google.com.sa', language: 'Arabic',
    additional_keywords: ['تصريف الأمطار', 'تصريف مياه الأمطار من الأسطح', 'شبكة تصريف مياه الأمطار'], confirm: true,
  });
  log(JSON.stringify(created));
  if (created?.query_id) {
    const rec = await step('nw_get_recommendations', { query: created.query_id, wait_seconds: 300, max_extended_terms: 5, max_competitors: 5, max_headings_per_competitor: 3 });
    log('status', rec?.status, '| target words', rec?.targets?.word_count, '| basic terms', rec?.terms?.content_basic?.length, '| questions', rec?.ideas?.questions?.length, '| competitors', rec?.competitors_total);
    log('competitors:', rec?.competitors?.map((c) => `${c.url} (${c.content_score})`).join(' | '));
  }
});
