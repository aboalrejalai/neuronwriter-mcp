// Import the article into NeuronWriter analysis 7ad66771b7fa151a and score it.
// Close the web Content Editor first — import refuses while it is open.
import { createRequire } from 'node:module';
import { live } from './harness.mjs';

const require = createRequire(import.meta.url);

// Load via tsx register when run as: npx tsx scripts/live/import-buraydah-article.mjs
const { prepareBeforeCallingBuraydahContractorArticle: a } = await import(
  '../../../atalanajd/src/packages/editorial/lib/articles/prepare-before-calling-buraydah-contractor.ts'
);

const QUERY = '7ad66771b7fa151a';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toHtml(article) {
  const parts = [`<h1>${escapeHtml(article.h1)}</h1>`, `<p>${escapeHtml(article.lead)}</p>`];
  for (const section of article.sections) {
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    for (const para of section.body.split(/\n+/).filter(Boolean)) {
      parts.push(`<p>${escapeHtml(para)}</p>`);
    }
  }
  if (article.faqs?.length) {
    parts.push(`<h2>${escapeHtml(article.faqHeading || 'أسئلة شائعة')}</h2>`);
    for (const faq of article.faqs) {
      parts.push(`<h3>${escapeHtml(faq.question)}</h3>`);
      parts.push(`<p>${escapeHtml(faq.answer)}</p>`);
    }
  }
  return parts.join('\n');
}

await live('import-buraydah-article', async ({ step, log }) => {
  const html = toHtml(a);
  log('html chars', html.length);

  const selected = await step('nw_select_competitors', {
    query: QUERY,
    mode: 'top10',
    confirm: true,
  });
  log('competitors selected', Boolean(selected));

  const meta = {
    title: a.title,
    description: a.description,
    html,
  };

  const scored = await step('nw_score_content', { query: QUERY, ...meta, term_detail: 'gaps' });
  log(
    'score',
    scored?.content_score ?? scored?.score,
    'words',
    scored?.word_count,
    JSON.stringify(scored?.targets ?? scored)?.slice(0, 200),
  );

  const imported = await step('nw_import_content', { query: QUERY, ...meta, term_detail: 'gaps' });
  log('import', JSON.stringify(imported)?.slice(0, 300));
});
