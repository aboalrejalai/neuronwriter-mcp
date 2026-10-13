// Waits for an analysis to be ready and prints a summary. Usage: node scripts/live/wait-analysis.mjs <queryId> [seconds]
import { live } from './harness.mjs';
const [query, seconds = '300'] = process.argv.slice(2);
await live('wait-analysis', async ({ step, log }) => {
  const rec = await step('nw_get_recommendations', { query, wait_seconds: Number(seconds), max_extended_terms: 5, max_competitors: 10, max_headings_per_competitor: 3 });
  log('status', rec?.status, '| target words', rec?.targets?.word_count, '| readability', rec?.targets?.readability, '| basic terms', rec?.terms?.content_basic?.length, '| questions', rec?.ideas?.questions?.length, '| competitors', rec?.competitors_total);
  log('competitors:', rec?.competitors?.map((c) => `#${c.rank} ${c.url} (${c.content_score})`).join(' | '));
});
