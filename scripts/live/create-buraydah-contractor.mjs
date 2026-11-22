// Owner-approved: one analysis for «مقاول بريدة» to brief the first support article.
import { live } from './harness.mjs';

const PROJECT = 'c4e17fb2aa86f36b';
const KEYWORD = 'مقاول بريدة';

await live('create-buraydah-contractor', async ({ step, log }) => {
  const listed = await step('nw_list_projects');
  const project =
    listed?.projects?.find((p) => p.name?.includes('atalanajd') || p.id === PROJECT) ??
    listed?.projects?.[0];
  log('project', project?.id, project?.name);

  const existing = await step('nw_list_queries', { project: project.id, keyword: KEYWORD });
  const hit = existing?.queries?.find((q) => q.keyword === KEYWORD);
  if (hit) {
    log('reuse', hit.id, hit.status ?? hit.score);
    const rec = await step('nw_get_recommendations', {
      query: hit.id,
      wait_seconds: 180,
    });
    log(JSON.stringify({
      title_terms: rec?.terms?.title?.slice?.(0, 15) ?? rec?.terms?.title,
      h1_terms: rec?.terms?.h1?.slice?.(0, 15),
      basic: rec?.terms?.content_basic?.slice?.(0, 25),
      questions: rec?.questions?.slice?.(0, 8),
      targets: rec?.targets,
    }, null, 2));
    return;
  }

  const created = await step('nw_create_query', {
    project: project.id,
    keyword: KEYWORD,
    engine: 'google.com.sa',
    language: 'Arabic',
    city: 'Buraydah',
    additional_keywords: ['مقاول في بريدة', 'مقاول القصيم بريدة', 'طلب مقاول بريدة'],
    confirm: true,
  });
  log('created', JSON.stringify(created));
  const id = created?.query_id ?? created?.id;
  if (!id) return;
  const rec = await step('nw_get_recommendations', {
    query: id,
    wait_seconds: 360,
    max_extended_terms: 8,
    max_competitors: 5,
    max_headings_per_competitor: 4,
  });
  log('status', rec?.status, '| words', rec?.targets?.word_count);
  log(JSON.stringify({
    basic: rec?.terms?.content_basic?.slice?.(0, 30),
    title: rec?.terms?.title?.slice?.(0, 12),
    h1: rec?.terms?.h1?.slice?.(0, 12),
    questions: rec?.ideas?.questions?.slice?.(0, 10) ?? rec?.questions?.slice?.(0, 10),
    headings: rec?.ideas?.headings?.slice?.(0, 12) ?? rec?.heading_ideas?.slice?.(0, 12),
    competitors: rec?.competitors?.map((c) => ({ url: c.url, score: c.content_score })),
  }, null, 2));
});
