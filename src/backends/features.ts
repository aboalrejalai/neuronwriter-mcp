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
  listRevisions(queryId: string, signal?: AbortSignal): Promise<Array<{ revision: string; saved_at: string; autosave: boolean }>>;
  listComments(queryId: string, signal?: AbortSignal): Promise<Comment[]>;
  addComment(queryId: string, text: string, parentId: string | null, signal?: AbortSignal): Promise<string | null>;
  editComment(queryId: string, commentId: string, text: string, signal?: AbortSignal): Promise<void>;
  setCommentStatus(queryId: string, commentId: string, status: 'resolved' | 'deleted', signal?: AbortSignal): Promise<void>;
  /** Classic internal-link suggestions from the project's own pages. */
  internalLinks(queryId: string, signal?: AbortSignal): Promise<InternalLink[]>;
  updateInternalLink(queryId: string, linkId: string, change: { status?: '' | 'TODO' | 'In progress' | 'Done'; note?: string }, signal?: AbortSignal): Promise<void>;
  /** "Find new ideas" for the content plan, based on this analysis. */
  contentIdeas(queryId: string, signal?: AbortSignal): Promise<ContentIdea[]>;
  addIdeaToPlan(queryId: string, config: string, signal?: AbortSignal): Promise<void>;
}

export interface Comment {
  id: string;
  text: string;
  parent_id: string | null;
}

export interface InternalLink {
  id: string;
  text: string;
  urls: string[];
  cells: string[];
}

export interface ContentIdea {
  text: string;
  /** Opaque value nw_update_content_plan action "add_idea" sends back. */
  config: string | null;
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

export interface AiTarget {
  /** Analysis id for analysis-scoped kinds. */
  query?: string;
  /** Project id for project-scoped kinds (ai_profile, AI Visibility). */
  project?: string;
}

export interface CustomTemplate {
  sig: string;
  name: string;
  prompt: string;
  system_role: string;
  notes: string;
  fields: string[];
}

export interface AiFeatures {
  /** Spends AI credits. */
  generate(target: AiTarget, request: AiRequest, signal?: AbortSignal): Promise<AiResult>;
  listTemplates(queryId: string, signal?: AbortSignal): Promise<CustomTemplate[]>;
  saveTemplate(queryId: string, template: Omit<CustomTemplate, 'sig'> & { sig?: string }, signal?: AbortSignal): Promise<CustomTemplate[]>;
  deleteTemplate(queryId: string, sig: string, signal?: AbortSignal): Promise<CustomTemplate[]>;
}

export interface PlanningFeatures {
  listContentPlan(projectId: string, signal?: AbortSignal): Promise<ContentPlanIdea[]>;
  addContentPlanIdea(projectId: string, keyword: string, additionalKeywords: string[], signal?: AbortSignal): Promise<void>;
  deleteContentPlanIdea(projectId: string, ideaId: string, signal?: AbortSignal): Promise<void>;
  updateContentPlanIdea(projectId: string, ideaId: string, field: 'assigned_to' | 'deadline', value: string, signal?: AbortSignal): Promise<void>;
  /** Content management calendar: analyses with a deadline and plan ideas with an expected date, in [from, to). */
  listCalendar(projectId: string, from: string, to: string, filters: { assigned_to?: string }, signal?: AbortSignal): Promise<CalendarEntry[]>;
}

export interface CalendarEntry {
  id: string;
  type: string;
  title: string;
  start: string | null;
  end: string | null;
  status: string | null;
}

export interface LookupFeatures {
  locations(projectId: string, query: string, engine: string, signal?: AbortSignal): Promise<Array<{ id: string; name: string }>>;
  /** Search Console keywords of a URL (needs Search Console connected to the project). */
  urlKeywords(projectId: string, url: string, signal?: AbortSignal): Promise<Array<{ text: string; cells: string[] }>>;
  /** Which page of the project should own a keyword. */
  suggestTargetUrl(projectId: string, keyword: string, signal?: AbortSignal): Promise<string[]>;
  hubPages(projectId: string, url: string, signal?: AbortSignal): Promise<Array<{ text: string; cells: string[] }>>;
}

export interface VisibilityFeatures {
  overview(projectId: string, signal?: AbortSignal): Promise<VisibilityOverview>;
  promptDetails(projectId: string, promptId: string, view: 'overview' | 'earn-mention', signal?: AbortSignal): Promise<string>;
  setBrands(projectId: string, brands: string[], signal?: AbortSignal): Promise<void>;
  addPrompts(projectId: string, prompts: string[], signal?: AbortSignal): Promise<void>;
  deletePrompt(projectId: string, promptId: string, signal?: AbortSignal): Promise<void>;
}

export interface VisibilityOverview {
  available: boolean;
  message: string | null;
  brands: string[];
  prompts_used: number | null;
  prompts_available: number | null;
  initialization: { progress: number | null; description: string | null } | null;
  prompts: Array<{ id: string; prompt: string; details: string }>;
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
  visibility: VisibilityFeatures;
  lookup: LookupFeatures;
}
