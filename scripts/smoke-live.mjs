// Read-only live smoke test: starts the built server over stdio like an MCP
// client would and calls every tool that spends nothing. Never writes.
// Usage: node scripts/smoke-live.mjs [projectId] [queryId]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const project = process.argv[2] ?? '6ec9249b8de0a586';
const query = process.argv[3] ?? 'c1f8fbd2b38960d3';

const client = new Client({ name: 'smoke-live', version: '0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['build/index.js'], env: { ...process.env, NW_BACKEND: 'session' }, stderr: 'inherit' }));

async function step(name, args = {}) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 });
  const ms = Date.now() - started;
  const summary = result.content?.[0]?.text?.split('\n')[0];
  console.log(`${result.isError ? 'FAIL' : 'ok  '} ${name.padEnd(24)} ${String(ms).padStart(6)} ms  ${summary}`);
  if (result.isError) console.log(result.content[0].text);
  return result.structuredContent;
}

try {
  await step('nw_status');
  const { projects } = await step('nw_list_projects');
  console.log('     projects:', projects.map((p) => `${p.id} ${p.name}`).join(' | '));
  const list = await step('nw_list_queries', { project, limit: 5 });
  console.log('     first:', list?.queries?.slice(0, 3).map((q) => `${q.id} "${q.keyword}" score=${q.content_score} words=${q.word_count}`).join(' | '));
  const rec = await step('nw_get_recommendations', { query, max_extended_terms: 5, max_competitors: 3 });
  console.log('     basic terms:', rec?.terms?.content_basic?.slice(0, 5).map((t) => `${t.term} ${t.min}-${t.max}`).join(', '));
  console.log('     h2:', rec?.terms?.h2?.slice(0, 4).join(', '), '| entities:', rec?.terms?.entities?.length, '| headings:', rec?.ideas?.headings?.length);
  console.log('     competitors:', rec?.competitors?.map((c) => `#${c.rank} ${c.url} score=${c.content_score}`).join(' | '), `(of ${rec?.competitors_total})`);
  const content = await step('nw_get_content', { query });
  console.log('     article:', JSON.stringify(content?.html?.slice(0, 80)), `length=${content?.html_length}`);
  if (content?.html) {
    const score = await step('nw_score_content', { query, html: content.html, title: content.title, description: content.description });
    console.log('     score of the saved article:', score?.content_score, '| words:', score?.word_count, '| readability:', score?.readability);
  }
} finally {
  await client.close();
}
