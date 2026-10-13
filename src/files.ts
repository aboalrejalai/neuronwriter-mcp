import { mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where exports and AI images go (NW_EXPORT_DIR, default ~/Downloads/neuronwriter-mcp). */
export function exportDir(): string {
  return process.env.NW_EXPORT_DIR || join(homedir(), 'Downloads', 'neuronwriter-mcp');
}

/** Keeps letters (Arabic included), digits, dot, dash; never lets a name climb out of the folder. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-').replace(/\s+/g, '-').replace(/^[.-]+/, '').slice(0, 120);
  return cleaned || 'file';
}

/** Writes bytes into the export folder without overwriting; returns the absolute path. */
export async function writeExport(name: string, bytes: Uint8Array, dir = exportDir()): Promise<string> {
  await mkdir(dir, { recursive: true });
  const safe = safeFileName(name);
  const dot = safe.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ''];
  for (let i = 0; ; i++) {
    const path = join(dir, i ? `${base}-${i}${ext}` : `${base}${ext}`);
    const exists = await stat(path).then(() => true, () => false);
    if (!exists) {
      await writeFile(path, bytes, { flag: 'wx' });
      return path;
    }
  }
}
