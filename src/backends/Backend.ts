import type { SessionFeatures } from './features.js';

// The contract both backends implement. Tools only talk to this interface,
// so they behave the same whichever backend answers.

export type BackendName = 'session' | 'api';

export interface Usage {
  used: number;
  limit: number;
}

export interface AccountStatus {
  backend: BackendName;
  logged_in: boolean;
  plan: string | null;
  content_writer: Usage | null;
  ai_credits: Usage | null;
  projects: Usage | null;
  resets_at: string | null;
}

export interface Project {
  id: string;
  name: string;
  language: string | null;
  engine: string | null;
}

export interface QuerySummary {
  id: string;
  keyword: string;
  created: string | null;
  engine: string | null;
  content_score: number | null;
  word_count: number | null;
  tags: string[];
  url: string;
}

export interface TermRange {
  term: string;
  min: number | null;
  max: number | null;
}

export interface Competitor {
  rank: number;
  url: string;
  title: string | null;
  content_score: number | null;
  word_count: number | null;
  /** The competitor page's H1-H3 outline, in order. */
  headings: Array<{ level: number; text: string }>;
}

export interface Recommendations {
  query_id: string;
  keyword: string | null;
  status: 'ready' | 'not_ready';
  targets: { word_count: number | null; readability: number | null };
  terms: {
    content_basic: TermRange[];
    content_extended: TermRange[];
    title: string[];
    description: string[];
    h1: string[];
    h2: string[];
    entities: string[];
    /** Terms the user excluded from this analysis. */
    excluded: string[];
    /** The user's own terms, by where they count. */
    custom: { text: string[]; h1: string[]; h2: string[] };
    /** Ranges the user overrode: term → [min, max]. */
    custom_ranges: Record<string, [number, number]>;
  };
  ideas: { headings: string[]; questions: string[] };
  competitors: Competitor[];
}

export interface ContentRevision {
  query_id: string;
  title: string;
  description: string;
  html: string;
  word_count: number | null;
  saved_at: string | null;
}

export interface ContentInput {
  html: string;
  title?: string;
  description?: string;
}

export type TermStatus = 'missing' | 'use_more' | 'ok' | 'use_less' | 'use_much_less';

export interface TermUsage {
  /** Body terms with the editor's own verdict per term. */
  body: Array<{ term: string; group: 'basic' | 'extended'; uses: number; min: number | null; max: number | null; status: TermStatus }>;
  /** Title/description/H1/H2 terms: whether each appears there. */
  placement: Array<{ term: string; section: 'title' | 'description' | 'h1' | 'h2'; used: boolean }>;
}

export interface Score {
  content_score: number | null;
  word_count: number | null;
  readability: number | null;
  details: Record<string, unknown> | null;
  /** Per-term usage, the way the editor's sidebar shows it (session backend). */
  terms?: TermUsage | null;
}

export interface CreateQueryInput {
  project: string;
  keyword: string;
  engine: string;
  language: string;
  additional_keywords?: string[];
}

/** Writing kinds: NeuronWriter templates run on one analysis. */
export const AI_TEMPLATE_KINDS = [
  'outline', 'meta', 'intro', 'paragraph', 'faq', 'rephrase', 'expand', 'article', 'titles', 'product_description',
  'category_description', 'product_reviews', 'content_plan_keywords', 'topical_map', 'youtube_description', 'email', 'synonyms',
] as const;
/** Other analysis-scoped AI actions. */
export const AI_ANALYSIS_KINDS = ['prompt', 'insert_terms', 'ai_score', 'facts', 'internal_links', 'image_ideas', 'image', 'designer_article', 'custom'] as const;
/** Project-scoped AI actions (AI Profile and AI Visibility). */
export const AI_PROJECT_KINDS = ['ai_profile', 'suggest_brands', 'suggest_prompts', 'readiness_audit', 'earn_mention', 'earn_mention_rewrite'] as const;
export const AI_KINDS = [...AI_TEMPLATE_KINDS, ...AI_ANALYSIS_KINDS, ...AI_PROJECT_KINDS] as const;
export type AiKind = (typeof AI_KINDS)[number];
export type AiTemplateKind = (typeof AI_TEMPLATE_KINDS)[number];
export const AI_TONES = ['neutral', 'expert', 'formal', 'informal', 'witty', 'funny', 'serious', 'respectful', 'motivating'] as const;
export const AI_MODELS = { default: 0, 'gpt-5': 2, claude: 3, gemini: 4 } as const;
export type AiModel = keyof typeof AI_MODELS;

export interface AiRequest {
  kind: AiKind;
  title?: string;
  /** Text to rephrase/expand/prompt over, or bullet points. */
  text?: string;
  heading?: string;
  /** HTML the action works on (insert_terms, ai_score, internal_links, prompt, designer_article outline). */
  html?: string;
  description?: string;
  /** Free instruction (kind "prompt"). */
  prompt?: string;
  keywords?: string[];
  product_name?: string;
  category_name?: string;
  video_title?: string;
  term?: string;
  /** Competitor URLs or other sources (facts). */
  sources?: string[];
  custom_sources?: string;
  idea?: string;
  ratio?: '3:2' | '1:1' | '2:3';
  style?: 'photograph' | 'cartoon' | 'painting' | 'sketch';
  template_sig?: string;
  fields?: Record<string, string>;
  urls?: string[];
  url?: string;
  prompt_type?: 'all' | 'research' | 'consideration' | 'decision';
  incentive?: string;
  original_content?: string;
  content_type?: 'article' | 'landing_page';
  content_requirements?: string;
  use_facts?: boolean;
  tone?: (typeof AI_TONES)[number];
  word_count?: number;
  model?: AiModel;
}

export interface AiResult {
  content: string;
  /** Meta title (kind "meta"; content is then the meta description). */
  title: string | null;
  usage: string | null;
  /** Kind-specific structured output (ideas, brands, prompts, score, image bytes as base64…). */
  data: Record<string, unknown> | null;
}

export interface PageContent {
  url: string;
  title: string;
  description: string;
  html: string;
}

export interface ContentPlanIdea {
  id: string;
  keyword: string;
  additional_keywords: string[];
  added: string | null;
  assigned_to: string | null;
  expected: string | null;
}

export interface ProjectSettings {
  project_id: string;
  mode: 'domain' | 'nondomain';
  name: string;
  homepage: string;
  engine: string;
  language: string;
  treat_title_as_h1: boolean;
  disable_long_terms: boolean;
  keywords: { desired: string[]; brand: string[]; negative: string[]; competitors: string[] };
  domains: { competitors: string[]; excluded: string[] };
  ai_profile: { overview: string; products_pricing: string; labeling_entities: string; personas: string; brand_voice: string };
  report_contact_info: string;
  /** The application password itself is never returned. */
  wordpress: { user: string; password_set: boolean; subdirectory: boolean; subdirectory_url: string };
}

/** Settings the tools may change. WordPress credentials, logo and currency are left as they are. */
export type ProjectSettingsPatch = Partial<Pick<ProjectSettings, 'name' | 'homepage' | 'engine' | 'language' | 'treat_title_as_h1' | 'disable_long_terms' | 'report_contact_info'>> & {
  keywords?: Partial<ProjectSettings['keywords']>;
  domains?: Partial<ProjectSettings['domains']>;
  ai_profile?: Partial<ProjectSettings['ai_profile']>;
};

export type CompetitorSelection = { mode: 'top10' | 'top30' } | { mode: 'custom'; keep_urls: string[] };

export interface Backend {
  readonly name: BackendName;
  /** Session-only capabilities (the web app beyond the public API); absent on the API backend. */
  readonly features?: SessionFeatures;
  status(signal?: AbortSignal): Promise<AccountStatus>;
  listProjects(signal?: AbortSignal): Promise<Project[]>;
  listQueries(projectId: string, signal?: AbortSignal): Promise<QuerySummary[]>;
  getRecommendations(queryId: string, signal?: AbortSignal): Promise<Recommendations>;
  getContent(queryId: string, signal?: AbortSignal): Promise<ContentRevision>;
  scoreContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  /** Saves the content as a new revision and returns its score. */
  importContent(queryId: string, input: ContentInput, signal?: AbortSignal): Promise<Score>;
  /** Spends 1 Content Writer analysis. Returns the new query id once it is listed. */
  createQuery(input: CreateQueryInput, signal?: AbortSignal): Promise<{ query_id: string | null }>;
  close(): Promise<void>;
}

export const APP_URL = 'https://app.neuronwriter.com';

export function analysisUrl(queryId: string): string {
  return `${APP_URL}/analysis/view/${queryId}`;
}
