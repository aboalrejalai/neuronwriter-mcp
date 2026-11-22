// Score (and optionally import) the Buraydah prepare article against analysis 7ad66771b7fa151a.
import { writeFileSync } from 'node:fs';
import { live } from './harness.mjs';

const { prepareBeforeCallingBuraydahContractorArticle: a } = await import(
  '../../../atalanajd/src/packages/editorial/lib/articles/prepare-before-calling-buraydah-contractor.ts'
);

const QUERY = '7ad66771b7fa151a';
const doImport = process.argv.includes('--import');
const force = process.argv.includes('--force');

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

await live('score-buraydah', async ({ step, log }) => {
  const html = toHtml(a);
  const meta = { title: a.title, description: a.description, html };
  writeFileSync('/tmp/nw-buraydah-html.html', html);

  const scored = await step('nw_score_content', { query: QUERY, ...meta, term_detail: 'gaps' });
  writeFileSync('/tmp/nw-buraydah-score.json', JSON.stringify(scored, null, 2));
  log('score', scored?.content_score, 'words', scored?.word_count, 'read', scored?.readability);
  for (const t of scored?.terms?.body ?? []) {
    log('term', t.term, t.status, `${t.uses}/${t.min}-${t.max}`);
  }
  for (const t of scored?.terms?.placement ?? []) {
    if (!t.used) log('place-miss', t.term, t.section);
  }

  if (doImport) {
    const imported = await step('nw_import_content', {
      query: QUERY,
      ...meta,
      term_detail: 'gaps',
      force,
    });
    writeFileSync('/tmp/nw-buraydah-import.json', JSON.stringify(imported, null, 2));
    log('imported score', imported?.content_score);
  }
});
