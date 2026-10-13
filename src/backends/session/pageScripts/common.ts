// Functions in this file run INSIDE a NeuronWriter page through page.evaluate().
// Playwright serializes them, so each one must be self-contained: no imports
// at runtime, no references to module scope. Page globals are declared in
// globals.d.ts and read with `typeof x !== 'undefined'`.

export function looksLikeLoginPage(): boolean {
  return Boolean(document.querySelector('input[type="password"]')) || /\/(login|signin|auth)\b/.test(location.pathname);
}

export interface InPageResponse {
  status: number;
  url: string;
  contentType: string | null;
  text: string;
}

export interface InPageRequest {
  path: string;
  marker: string;
  /** "json": $.post(url, JSON.stringify(body)) — the app's usual call. "form": URL-encoded fields. "get": query string. */
  encoding: 'json' | 'form' | 'get';
  body: unknown;
}

/** Sends a request the way the app's own jQuery/FullCalendar code does, plus our marker header. */
export async function requestFromPage(args: InPageRequest): Promise<InPageResponse> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', [args.marker]: '1' };
  let url = args.path;
  let body: string | undefined;
  if (args.encoding === 'get') {
    url += `?${new URLSearchParams(args.body as Record<string, string>).toString()}`;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    body = args.encoding === 'form' ? new URLSearchParams(args.body as Record<string, string>).toString() : JSON.stringify(args.body);
  }
  const response = await fetch(url, { method: args.encoding === 'get' ? 'GET' : 'POST', credentials: 'same-origin', headers, body });
  return {
    status: response.status,
    url: response.url,
    contentType: response.headers.get('content-type'),
    text: await response.text(),
  };
}
