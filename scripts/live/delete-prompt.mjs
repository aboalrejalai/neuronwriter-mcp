import { live } from './harness.mjs';
const [P, id] = process.argv.slice(2);
await live('delete-prompt', async ({ step }) => { await step('nw_update_ai_visibility', { project: P, action: 'delete_prompt', prompt_id: id }); });
