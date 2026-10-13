// Live check of project-level tools on the Atlalat Najd project (plan 002 phases 5–7).
// Every test change is reverted; brand names are real and kept.
import { live } from './harness.mjs';
const P = process.env.NW_PROJECT ?? 'c4e17fb2aa86f36b';

await live('phase5-project', async ({ step, onRevert, log }) => {
  // Content plan: add → assign → deadline → delete
  const added = await step('nw_update_content_plan', { project: P, action: 'add', keyword: 'اختبار MCP — احذف', additional_keywords: ['اختبار'] });
  const idea = added?.ideas?.find((i) => i.keyword.toLowerCase() === 'اختبار mcp — احذف'); // NeuronWriter lowercases keywords
  log('idea', idea?.id);
  if (idea) {
    onRevert(() => step('nw_update_content_plan', { project: P, action: 'delete', idea_id: idea.id }));
    await step('nw_update_content_plan', { project: P, action: 'assign', idea_id: idea.id, value: 'Mohammed' });
    const dated = await step('nw_update_content_plan', { project: P, action: 'deadline', idea_id: idea.id, value: '2026-10-30' });
    log('after assign+deadline', JSON.stringify(dated?.ideas?.find((i) => i.id === idea.id)));
  }
  const plan = await step('nw_get_project_data', { project: P, part: 'content_plan' });
  log('plan', JSON.stringify(plan?.data));

  // Calendar: plan ideas with an expected date (and analyses with a deadline) show up
  const cal = await step('nw_get_project_data', { project: P, part: 'calendar', from: '2026-10-01', to: '2026-11-30' });
  log('calendar', JSON.stringify(cal?.data));
  // Leftovers from earlier runs
  for (const old of (plan?.data ?? []).filter((i) => i.keyword.toLowerCase().startsWith('اختبار mcp') && i.id !== idea?.id)) {
    await step('nw_update_content_plan', { project: P, action: 'delete', idea_id: old.id });
  }

  // AI Visibility: overview, brands (kept), one prompt added then deleted
  const vis = await step('nw_get_project_data', { project: P, part: 'ai_visibility' });
  log('visibility', JSON.stringify(vis?.data));
  await step('nw_update_ai_visibility', { project: P, action: 'set_brands', brands: ['أطلالة نجد', 'اطلالة نجد'] });
  await step('nw_update_ai_visibility', { project: P, action: 'add_prompts', prompts: ['من هو أفضل مقاول تسليم مفتاح في بريدة؟'] });
  const vis2 = await step('nw_get_project_data', { project: P, part: 'ai_visibility' });
  log('after add', JSON.stringify(vis2?.data));
  for (const p of vis2?.data?.prompts ?? []) onRevert(() => step('nw_update_ai_visibility', { project: P, action: 'delete_prompt', prompt_id: p.id }));

  // Metrics refresh (search volumes for the project targeting)
  await step('nw_refresh_metrics', { what: 'volume', project: P, confirm: true });
});
