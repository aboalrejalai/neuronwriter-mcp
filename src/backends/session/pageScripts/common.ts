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

export interface HtmlRow {
  id: string;
  text: string;
  cells: string[];
  links: string[];
  onclicks: string[];
}

/** Parses server-rendered HTML fragments (internal links, ideas, comments) into rows, inside the page's own DOM parser. */
export function parseHtmlRows(args: { html: string | null; selector: string; container?: string }): HtmlRow[] {
  const root = document.createElement('div');
  if (args.html !== null) root.innerHTML = args.html;
  const scope = args.html === null ? (args.container ? document.querySelector(args.container) : document) : root;
  if (!scope) return [];
  return [...scope.querySelectorAll(args.selector)].map((row) => ({
    id: row.id,
    text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
    cells: [...row.querySelectorAll(':scope > td, :scope > th')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
    links: [...row.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '').filter((h) => h && !h.startsWith('#') && !h.startsWith('javascript')),
    onclicks: [...row.querySelectorAll('[onclick]')].map((el) => el.getAttribute('onclick') ?? ''),
  }));
}
