// The only place internal NeuronWriter paths live. Shapes recorded from the
// web app's own JS on 2026-10-12 (see docs/backend-endpoints.md).

import type { RequestKind } from '../../limiter.js';

export interface Endpoint {
  path: string;
  kind: RequestKind;
  /** Spends Content Writer analyses or AI credits. */
  spendsCredits: boolean;
  /** How the app sends it; JSON string body unless stated. */
  encoding?: 'json' | 'form' | 'get';
}

export const ENDPOINTS = {
  getContentRevision: { path: '/backend/get-content-revision', kind: 'read', spendsCredits: false },
  checkReadability: { path: '/backend/check-readability', kind: 'read', spendsCredits: false },
  saveOptimizedContent: { path: '/backend/save-optimized-content', kind: 'write', spendsCredits: false },
  markContentAsDone: { path: '/backend/mark-content-as-done', kind: 'write', spendsCredits: false },
  unmarkContentAsDone: { path: '/backend/unmark-content-as-done', kind: 'write', spendsCredits: false },
  newAnalysis: { path: '/backend/new-analysis', kind: 'write', spendsCredits: true },
  generateAiContent: { path: '/backend/generate-ai-content', kind: 'write', spendsCredits: true },
  autoImportContent: { path: '/backend/auto-import-content', kind: 'read', spendsCredits: false },
  updateTagsStatus: { path: '/backend/update-tags-status', kind: 'write', spendsCredits: false },
  selectCompetitors: { path: '/backend/analysis-select-competitors', kind: 'write', spendsCredits: false },
  addToContentPlan: { path: '/backend/manual-add-to-content-plan', kind: 'write', spendsCredits: false },
  getProjectSettings: { path: '/backend/get-project-settings', kind: 'read', spendsCredits: false },
  addCustomTerm: { path: '/backend/analysis-add-custom-term', kind: 'write', spendsCredits: false },
  deleteCustomTerm: { path: '/backend/analysis-delete-custom-term', kind: 'write', spendsCredits: false },
  updateTermParams: { path: '/backend/analysis-update-custom-term-params', kind: 'write', spendsCredits: false },
  excludeTerm: { path: '/backend/analysis-exclude-term', kind: 'write', spendsCredits: false },
  updateExclusionSettings: { path: '/backend/analysis-update-exclusion-settings', kind: 'write', spendsCredits: false },
  updateTargets: { path: '/backend/analysis-update-targets', kind: 'write', spendsCredits: false },
  updateTargetUrl: { path: '/backend/update-target-url', kind: 'write', spendsCredits: false },
  updateManagementInfo: { path: '/backend/update-analysis-management-info', kind: 'write', spendsCredits: false },
  updateDistribution: { path: '/backend/update-analysis-distribution', kind: 'write', spendsCredits: false },
  deleteAnalysis: { path: '/backend/delete-analysis', kind: 'write', spendsCredits: false },
  requestMozUpdate: { path: '/backend/request-moz-update', kind: 'write', spendsCredits: false },
  requestVolumeUpdate: { path: '/backend/request-volume-update', kind: 'write', spendsCredits: false },
  checkPlagiarism: { path: '/backend/check-for-plagiarism', kind: 'write', spendsCredits: true },
  exportContent: { path: '/backend/export-content-as', kind: 'read', spendsCredits: false },
  analysisStatus: { path: '/backend/analysis-status', kind: 'read', spendsCredits: false },
  checkProjectLimit: { path: '/backend/check-project-limit', kind: 'read', spendsCredits: false },
  newProjectDomain: { path: '/backend/new-project-domain', kind: 'read', spendsCredits: false },
  newProject: { path: '/backend/new-project', kind: 'write', spendsCredits: false },
  updateProjectSettings: { path: '/backend/update-project-settings', kind: 'write', spendsCredits: false },
} as const satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof ENDPOINTS;

/** Never called by this server: destructive, sharing, billing or account-level. */
export const FORBIDDEN_ENDPOINTS = [
  'delete-project',
  'delete-my-account',
  'generate-ai-outline', // dead code in the web app; answers HTTP 500 (2026-10-13)
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
  projectSettings: (projectId: string) => `/project/view/${projectId}/settings`,
  contentPlan: (projectId: string) => `/project/view/${projectId}/content-plan`,
  analysis: (queryId: string) => `/analysis/view/${queryId}`,
};

/** Header our own in-page requests carry; the browser blocks every other /backend/ call… */
export const OWN_REQUEST_HEADER = 'x-nw-mcp';

/**
 * …except these reads the analysis page makes on its own load. Some page data
 * (heading ideas) only appears after them. Writes such as autosave stay blocked.
 */
export const PAGE_ALLOWED_READS = ['get-content-revision', 'check-readability', 'get-project-asset/'] as const;
