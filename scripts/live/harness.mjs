// Live verification against the owner's account, over real stdio like any MCP
// client. Every run logs what it spent (analyses, AI credits) and runs its
// reverts in finally, even when a step fails. See plan 002 REQ-006/REQ-007.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function live(name, body) {
  const client = new Client({ name: `live-${name}`, version: '0' });
  await client.connect(new StdioClientTransport({ command: 'node', args: ['build/index.js'], env: { ...process.env, NW_BACKEND: 'session' }, stderr: 'inherit' }));
  const reverts = [];
  const results = { ok: 0, failed: 0 };

  async function step(tool, args = {}, { quiet = false, expectError = false } = {}) {
    const started = Date.now();
    const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 900_000 });
    const failed = Boolean(result.isError) !== expectError;
    results[failed ? 'failed' : 'ok']++;
    const summary = result.content?.[0]?.text?.split('\n')[0] ?? '';
    console.log(`${failed ? 'FAIL' : 'ok  '} ${tool.padEnd(28)} ${String(Date.now() - started).padStart(6)} ms  ${summary}`);
    if (result.isError && !quiet) console.log('      ', result.content[0].text.replace(/\n/g, ' | '));
    return result.isError ? null : result.structuredContent;
  }
  const usage = async () => (await client.callTool({ name: 'nw_status', arguments: {} })).structuredContent;

  const before = await usage();
  try {
    await body({ step, onRevert: (fn) => reverts.unshift(fn), log: (...a) => console.log('      ', ...a) });
  } finally {
    for (const revert of reverts) {
      try {
        await revert();
      } catch (error) {
        console.log('REVERT FAILED', error.message);
      }
    }
    const after = await usage();
    const spent = (key) => (after?.[key]?.used ?? 0) - (before?.[key]?.used ?? 0);
    console.log(`\n${name}: ${results.ok} ok, ${results.failed} failed · spent ${spent('content_writer')} analyses, ${spent('ai_credits')} AI credits · now ${after?.content_writer?.used}/${after?.content_writer?.limit} analyses, ${after?.ai_credits?.used}/${after?.ai_credits?.limit} AI credits`);
    await client.close();
    if (results.failed) process.exitCode = 1;
  }
}
