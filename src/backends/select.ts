import { ApiBackend } from './api/ApiBackend.js';
import type { Backend } from './Backend.js';
import { SessionBackend } from './session/SessionBackend.js';

/** NW_BACKEND=session|api|auto (default). auto = api when a key is set, else session. */
export function selectBackend(env: NodeJS.ProcessEnv = process.env): Backend {
  const mode = (env.NW_BACKEND ?? 'auto').toLowerCase();
  const apiKey = env.NEURONWRITER_API_KEY ?? env.NW_API_KEY;
  if (mode === 'api' || (mode === 'auto' && apiKey)) {
    if (!apiKey) throw new Error('NW_BACKEND=api needs NEURONWRITER_API_KEY (or NW_API_KEY). Bronze plans have no API access; use NW_BACKEND=session.');
    return new ApiBackend(apiKey);
  }
  if (mode !== 'session' && mode !== 'auto') throw new Error(`Unknown NW_BACKEND "${mode}". Use session, api or auto.`);
  return new SessionBackend();
}
