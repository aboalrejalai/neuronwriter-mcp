// Session-only capabilities: what the web app can do beyond the public API.
// Tools reach them through requireSession() (tools/shared.ts); the API
// backend simply has none.

import type { ContentInput, AiRequest, AiResult, CompetitorSelection, ContentPlanIdea, PageContent, ProjectSettings, ProjectSettingsPatch } from './Backend.js';

export interface AnalysisFeatures {
  setDone(queryId: string, done: boolean, signal?: AbortSignal): Promise<void>;
  /** Replaces the analysis' tags (the "Done"/"Deleted" statuses are tags too). */
  setTags(projectId: string, queryId: string, tags: string[], signal?: AbortSignal): Promise<void>;
  /** Changes which competitors the analysis is computed from; returns the selected URLs. */
  selectCompetitors(queryId: string, selection: CompetitorSelection, signal?: AbortSignal): Promise<string[]>;
  /** NeuronWriter fetches a URL and extracts its title, description and body (nothing is saved). */
  fetchPage(queryId: string, url: string, signal?: AbortSignal): Promise<PageContent>;
  /** Custom terms, ranges, exclusions and the negative-terms filter of one analysis. */
  updateTerms(queryId: string, change: TermAction, signal?: AbortSignal): Promise<void>;
  /** Targets, target URL, person, deadline, distribution notes. */
  updateAnalysis(queryId: string, patch: AnalysisPatch, signal?: AbortSignal): Promise<void>;
  /** Soft delete: the analysis gets the "Deleted" tag and can be restored by removing it. */
  deleteQuery(projectId: string, queryId: string, signal?: AbortSignal): Promise<void>;
  refreshMoz(queryId: string, signal?: AbortSignal): Promise<void>;
  /** Refreshes search volumes for the project's language|engine targeting; returns the targeting. */
  refreshVolume(projectId: string, signal?: AbortSignal): Promise<string>;
  checkPlagiarism(queryId: string, content: ContentInput, signal?: AbortSignal): Promise<PlagiarismResult>;
  /** NeuronWriter's DOCX export of the given content. */
  exportDocx(queryId: string, content: ContentInput, fileName: string, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface PlagiarismResult {
  check_id: string | null;
  unique_percent: number | null;
  matched_sentences: number | null;
  sources: number | null;
  details_url: string | null;
}

export type TermAction =
  | { action: 'add'; terms: string[]; location: 'text' | 'h1' | 'h2' }
  | { action: 'remove'; term: string; location: 'text' | 'h1' | 'h2' }
  | { action: 'set_range'; term: string; min: number; max: number }
  | { action: 'reset_range'; term: string }
  | { action: 'exclude'; term: string }
  | { action: 'reinclude'; term: string }
  | { action: 'negative_filter'; on: boolean };

export interface AnalysisPatch {
  target_word_count?: number;
  target_readability?: number;
  target_url?: string;
  assigned_to?: string;
  /** YYYY-MM-DD, or '' to clear. */
  deadline?: string;
  distribution?: string;
}

export interface AiFeatures {
  /** Spends AI credits. */
  generate(queryId: string, request: AiRequest, signal?: AbortSignal): Promise<AiResult>;
}

export interface PlanningFeatures {
  listContentPlan(projectId: string, signal?: AbortSignal): Promise<ContentPlanIdea[]>;
  addContentPlanIdea(projectId: string, keyword: string, additionalKeywords: string[], signal?: AbortSignal): Promise<void>;
}

export interface ProjectFeatures {
  getSettings(projectId: string, signal?: AbortSignal): Promise<ProjectSettings>;
  /** Reads every setting, applies the patch and saves the whole form (the app's only way to save). */
  updateSettings(projectId: string, patch: ProjectSettingsPatch, signal?: AbortSignal): Promise<ProjectSettings>;
  /** Uses one of the plan's project slots. */
  create(input: NewProjectInput, signal?: AbortSignal): Promise<{ project_id: string; homepage: string; engine: string; language: string }>;
}

export interface NewProjectInput {
  mode: 'domain' | 'nondomain';
  /** Domain (domain mode) or project name (non-domain mode). */
  domain_or_name: string;
  engine?: string;
  language?: string;
  keywords?: string[];
}

export interface SessionFeatures {
  analysis: AnalysisFeatures;
  ai: AiFeatures;
  planning: PlanningFeatures;
  projects: ProjectFeatures;
}
