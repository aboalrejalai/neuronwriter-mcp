// Removes test prompts from AI Visibility (they use the plan's monitored-prompt slots).
import { live } from './harness.mjs';
const P = process.env.NW_PROJECT ?? 'c4e17fb2aa86f36b';
await live('cleanup-visibility', async ({ step, log }) => {
  const vis = await step('nw_get_project_data', { project: P, part: 'ai_visibility' });
  log(JSON.stringify(vis?.data?.prompts), '| slots', vis?.data?.prompts_used, '/', vis?.data?.prompts_available);
  for (const p of vis?.data?.prompts ?? []) {
    if (p.prompt.includes('مقاول تسليم مفتاح في بريدة')) await step('nw_update_ai_visibility', { project: P, action: 'delete_prompt', prompt_id: p.id });
  }
  const after = await step('nw_get_project_data', { project: P, part: 'ai_visibility' });
  log('after: slots', after?.data?.prompts_used, '/', after?.data?.prompts_available, '| prompts', JSON.stringify(after?.data?.prompts));
});
