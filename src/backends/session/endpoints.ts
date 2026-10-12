// The only place internal NeuronWriter paths live. Shapes recorded from the
// web app's own JS on 2026-10-12 (see docs/backend-endpoints.md).

import type { RequestKind } from '../../limiter.js';

export interface Endpoint {
  path: string;
  kind: RequestKind;
  /** Spends Content Writer analyses or AI credits. */
  spendsCredits: boolean;
}

export const ENDPOINTS = {
  getContentRevision: { path: '/backend/get-content-revision', kind: 'read', spendsCredits: false },
  checkReadability: { path: '/backend/check-readability', kind: 'read', spendsCredits: false },
  saveOptimizedContent: { path: '/backend/save-optimized-content', kind: 'write', spendsCredits: false },
  markContentAsDone: { path: '/backend/mark-content-as-done', kind: 'write', spendsCredits: false },
  unmarkContentAsDone: { path: '/backend/unmark-content-as-done', kind: 'write', spendsCredits: false },
  newAnalysis: { path: '/backend/new-analysis', kind: 'write', spendsCredits: true },
  generateAiOutline: { path: '/backend/generate-ai-outline', kind: 'write', spendsCredits: true },
} as const satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof ENDPOINTS;

/** Never called by this server: destructive, sharing, billing or account-level. */
export const FORBIDDEN_ENDPOINTS = [
  'delete-project',
  'add-analysis-access',
  'revoke-analysis-access',
  'update-share-analysis-link',
  'login',
  'survey',
  'survey-submit',
  'news-close',
  'news-cta',
  'notifications-mark-all-as-read',
  'notifications-mark-as-read',
] as const;

export const PAGES = {
  home: '/',
  profile: '/ucp/profile',
  project: (projectId: string) => `/project/view/${projectId}/optimisation`,
  analysis: (queryId: string) => `/analysis/view/${queryId}`,
};

/** Header our own in-page requests carry; the browser blocks every other /backend/ call… */
export const OWN_REQUEST_HEADER = 'x-nw-mcp';

/**
 * …except these reads the analysis page makes on its own load. Some page data
 * (heading ideas) only appears after them. Writes such as autosave stay blocked.
 */
export const PAGE_ALLOWED_READS = ['get-content-revision', 'check-readability', 'get-project-asset/'] as const;
