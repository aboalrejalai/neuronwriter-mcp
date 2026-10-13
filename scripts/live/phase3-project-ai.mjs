// Project-scoped AI and lookups on atalanajd.com (plan 002 TASK-016/027/030/031). AI credits within REQ-007; nothing is saved.
import { live } from './harness.mjs';
const P = 'c4e17fb2aa86f36b';
await live('phase3-project-ai', async ({ step, log }) => {
  const loc = await step('nw_lookup', { project: P, action: 'locations', query: 'Buraydah' });
  log('locations', JSON.stringify(loc?.items?.slice(0, 5)));
  const target = await step('nw_lookup', { project: P, action: 'suggest_target_url', keyword: 'مقاول ترميم' });
  log('suggest_target_url', JSON.stringify(target?.items));
  const kw = await step('nw_lookup', { project: P, action: 'url_keywords', url: 'https://atalanajd.com/' }, { quiet: true, expectError: true });
  const profile = await step('nw_generate_ai', { kind: 'ai_profile', project: P, urls: ['https://atalanajd.com/'], confirm: true });
  log('ai_profile', JSON.stringify(profile?.data).slice(0, 600), profile?.usage);
  const brands = await step('nw_generate_ai', { kind: 'suggest_brands', project: P, confirm: true });
  log('brands', JSON.stringify(brands?.data), brands?.usage);
  const prompts = await step('nw_generate_ai', { kind: 'suggest_prompts', project: P, url: 'https://atalanajd.com/', prompt_type: 'all', confirm: true });
  log('prompts', JSON.stringify(prompts?.data).slice(0, 600), prompts?.usage);
  const audit = await step('nw_generate_ai', { kind: 'readiness_audit', project: P, url: 'https://atalanajd.com/', confirm: true });
  log('readiness_audit', (audit?.content ?? '').slice(0, 500), audit?.usage);
});
