#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { APP_URL } from './backends/Backend.js';
import { selectBackend } from './backends/select.js';
import { launchContext, profileDir } from './backends/session/browser.js';
import { readProjectsNav } from './backends/session/pageScripts/project.js';
import { NwError } from './errors.js';
import { log } from './log.js';
import { VERSION, createServer } from './server.js';

const HELP = `neuronwriter-mcp ${VERSION}

Usage: neuronwriter-mcp [command]

Commands:
  serve    Run the MCP server on stdio (default)
  login    Open a browser window to sign in to NeuronWriter once; the session is kept in the profile folder
  status   Check the session and print plan, usage and reset date

Environment:
  NW_BACKEND             session | api | auto (default: api when a key is set, else session)
  NW_PROFILE_DIR         browser profile folder (default: ~/.neuronwriter-mcp/profile)
  NEURONWRITER_API_KEY   API key (Gold plan or higher only)`;

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

async function serve(): Promise<void> {
  const backend = selectBackend();
  const server = createServer(backend);
  const shutdown = async () => {
    await backend.close();
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);
  await server.connect(new StdioServerTransport());
  log(`v${VERSION} running on stdio (${backend.name} backend)`);
}

async function login(): Promise<void> {
  const dir = profileDir();
  log(`Opening a browser window. Sign in to NeuronWriter yourself; this tool never sees your password. Profile: ${dir}`);
  const context = await launchContext(dir, false);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(APP_URL);
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const signedIn = await page.evaluate(readProjectsNav).then((projects) => projects.length > 0).catch(() => false);
      if (signedIn) {
        log('Signed in. Session saved; closing the window.');
        return;
      }
      await page.waitForTimeout(2000);
    }
    throw new Error('Timed out after 10 minutes waiting for the sign-in.');
  } finally {
    await context.close();
  }
}

async function status(): Promise<void> {
  const backend = selectBackend();
  try {
    const s = await backend.status();
    const usage = (u: { used: number; limit: number } | null) => (u ? `${u.used} used / ${u.limit}` : 'unknown');
    console.log(`Backend:         ${s.backend}`);
    console.log(`Plan:            ${s.plan ?? 'unknown'}`);
    console.log(`Content writer:  ${usage(s.content_writer)}`);
    console.log(`AI credits:      ${usage(s.ai_credits)}`);
    console.log(`Projects:        ${usage(s.projects)}`);
    console.log(`Limits reset:    ${s.resets_at ?? 'unknown'}`);
  } finally {
    await backend.close();
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } } });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(VERSION);
  const command = positionals[0] ?? 'serve';
  if (command === 'serve') return serve();
  if (command === 'login') return login();
  if (command === 'status') return status();
  console.error(`Unknown command "${command}".\n\n${HELP}`);
  process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof NwError ? `${error.message}\n${error.hint}` : error instanceof Error ? error.message : error);
  process.exit(1);
});
