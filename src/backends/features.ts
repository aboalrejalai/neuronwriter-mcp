// Session-only capabilities: what the web app can do beyond the public API.
// Tools reach them through requireSession() (tools/shared.ts); the API
// backend simply has none.

import type { AiRequest, AiResult, CompetitorSelection, ContentPlanIdea, PageContent, ProjectSettings, ProjectSettingsPatch } from './Backend.js';

export interface AnalysisFeatures {
  setDone(queryId: string, done: boolean, signal?: AbortSignal): Promise<void>;
  /** Replaces the analysis' tags (the "Done"/"Deleted" statuses are tags too). */
  setTags(projectId: string, queryId: string, tags: string[], signal?: AbortSignal): Promise<void>;
  /** Changes which competitors the analysis is computed from; returns the selected URLs. */
  selectCompetitors(queryId: string, selection: CompetitorSelection, signal?: AbortSignal): Promise<string[]>;
  /** NeuronWriter fetches a URL and extracts its title, description and body (nothing is saved). */
  fetchPage(queryId: string, url: string, signal?: AbortSignal): Promise<PageContent>;
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
}

export interface SessionFeatures {
  analysis: AnalysisFeatures;
  ai: AiFeatures;
  planning: PlanningFeatures;
  projects: ProjectFeatures;
}
