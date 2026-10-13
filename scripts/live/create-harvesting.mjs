// Owner-approved budget (plan 002 REQ-007): second analysis, plain body (no supporting keywords), to tell
// a stuck analysis from a stuck queue. Atlalat Najd plan keyword 4 «تجميع مياه الأمطار» (TASK-024 there).
import { live } from './harness.mjs';
await live('create-harvesting', async ({ step, log }) => {
  const created = await step('nw_create_query', { project: 'c4e17fb2aa86f36b', keyword: 'تجميع مياه الأمطار', engine: 'google.com.sa', language: 'Arabic', confirm: true });
  log(JSON.stringify(created));
  if (created?.query_id) {
    const rec = await step('nw_get_recommendations', { query: created.query_id, wait_seconds: 290, max_extended_terms: 3, max_competitors: 3, max_headings_per_competitor: 2 });
    log('status', rec?.status, '| target words', rec?.targets?.word_count, '| basic', rec?.terms?.content_basic?.length);
  }
  const first = await step('nw_get_recommendations', { query: '871b250294d89d4c', max_extended_terms: 0, max_competitors: 0 });
  log('first analysis status', first?.status);
});
