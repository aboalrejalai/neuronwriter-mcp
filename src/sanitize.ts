// Text scraped from third-party pages (competitor titles, URLs) reaches the
// agent as data. Strip characters that can hide instructions or reorder text,
// and cap the length. The owner's own content is never passed through here:
// it must round-trip byte-identical.

// C0/C1 control chars (except tab and newline), zero-width chars, and the
// bidi override/isolate range that can visually reorder text.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‍⁠﻿‪-‮⁦-⁩]/g;

export function sanitizeExternalText(value: unknown, maxLength = 300): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!text || text === 'null') return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
