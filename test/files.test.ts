import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeFileName, writeExport } from '../src/files.js';

describe('export files', () => {
  it('keeps Arabic names but never paths', () => {
    expect(safeFileName('تصريف مياه الأمطار.docx')).toBe('تصريف-مياه-الأمطار.docx');
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
  });

  it('never overwrites an existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nw-export-'));
    const a = await writeExport('a.docx', new Uint8Array([1]), dir);
    const b = await writeExport('a.docx', new Uint8Array([2]), dir);
    expect(b).not.toBe(a);
    expect([...(await readFile(a))]).toEqual([1]);
    expect([...(await readFile(b))]).toEqual([2]);
  });
});
