// Functions in this file run INSIDE a NeuronWriter page through page.evaluate().
// Playwright serializes them, so each one must be self-contained: no imports
// at runtime, no references to module scope. Page globals are declared in
// globals.d.ts and read with `typeof x !== 'undefined'`.

export interface AiBodyArgs {
  template: string;
  /** Sent as wizard_mode by the Content Designer flows (outline, meta); omitted by the editor's template form. */
  wizardMode: string | null;
  title: string;
  text: string;
  heading: string;
  tone: string;
  wordCount: number;
  model: number;
  html: string;
  /** "template" (default) or "ai-selection" (free prompt). */
  mode?: string;
  /** Extra template_params fields (product name, keywords, prompt…), applied last. */
  fields?: Record<string, unknown>;
  isCustom?: boolean;
}

/**
 * Body of /backend/generate-ai-content (mode "template"), built the way the
 * editor's template form and the Content Designer wizard build it.
 */
export function buildAiBody(args: AiBodyArgs): Record<string, unknown> {
  const join = (list: unknown) => (typeof join_text_list_w_limit === 'function' ? join_text_list_w_limit(list ?? [], 500, '\n') : (Array.isArray(list) ? list.join('\n') : ''));
  const keyword = document.title.split(' - analysis details')[0].trim();
  const title = args.title || keyword;
  const basic = join(get_must_have_terms(true, 'text'));
  const extended = join(get_extended_terms(true, 'text'));
  const h1 = join(get_h1_terms(true, 'text'));
  const h2 = join(get_h2_terms(true, 'text'));
  const entities = join(typeof all_entities !== 'undefined' ? all_entities : []);
  const temperature = typeof AI_TEMPERATURE_LEVELS !== 'undefined' ? AI_TEMPERATURE_LEVELS[3] : 0.7;
  const common = {
    mode: 'template',
    project: PROJECT_SIG,
    analysis: contadu_analysis_sig,
    language: typeof analysis_language !== 'undefined' ? analysis_language : '',
    text: '',
    temperature,
    range_index: null,
    range_length: null,
    high_quality: args.model,
  };
  if (args.template === 'content-designer-blog-outline') {
    return {
      wizard_mode: 'wizard-outline',
      ...common,
      template_params: { template: args.template, title, h1terms: h1, h2terms: h2, basicterms: basic, extendedterms: extended, entities, compoutlines: true, toneofvoice: args.tone, content_requirements: '' },
      content: '',
    };
  }
  if (args.template === 'content-designer-blog-article' || args.template === 'content-designer-landing-page') {
    return {
      wizard_mode: 'wizard-content',
      ...common,
      template_params: {
        template: args.template, title, h1terms: h1, h2terms: h2, basicterms: basic, extendedterms: extended, entities,
        toneofvoice: args.tone, addimages: false, use_bolds: true, rich_formatting: false, use_ai_overview: false,
        contentlength: args.wordCount, content_requirements: String(args.fields?.content_requirements ?? ''),
      },
      use_ai_overview: false,
      content: args.html,
    };
  }
  if (args.template === 'content-designer-meta-title-and-description') {
    return {
      wizard_mode: 'wizard-meta',
      ...common,
      template_params: {
        template: args.template,
        titleterms: (typeof meta_title_terms !== 'undefined' ? meta_title_terms : []).join(', '),
        titleexamples: get_meta_title_examples(10, 500),
        descterms: (typeof meta_description_terms !== 'undefined' ? meta_description_terms : []).join(', '),
        descexamples: get_meta_desc_examples(5, 500),
        toneofvoice: args.tone,
      },
      content: '',
    };
  }
  // Editor template form: every field is always sent, empty when the template does not use it.
  const fields: Record<string, unknown> = {
    analysis_keyword: keyword, template: args.template, is_custom: false, prompt: '', systemrole: '',
    heading: args.heading, productname: '', categoryname: '', terms: '', metaterms: '', bulletpoints: '', toneofvoice: args.tone,
    keywords: '', keywordtitle: '', examples: '', videotitle: '', arttitle: '', lengthinwords: '', title, description: '',
    query: keyword, h1terms: h1, h2terms: h2, basicterms: basic, extendedterms: extended, entities,
    unusedbasicterms: basic, unusedextendedterms: extended, unusedh2terms: h2, termsoneperline: '', compoutlines: false,
    text: args.text, contentlength: args.wordCount, content_terms: typeof content_terms !== 'undefined' ? content_terms : {}, smart_mode: true,
  };
  if (args.template === 'intro-terms') Object.assign(fields, { keywordtitle: title, terms: basic, bulletpoints: args.text });
  if (args.template === 'paragraph-heading-terms') Object.assign(fields, { bulletpoints: args.text });
  if (!fields.terms) fields.terms = basic;
  if (args.isCustom) fields.is_custom = true;
  Object.assign(fields, args.fields ?? {});
  if (!fields.keywords) fields.keywords = keyword;
  const mode = args.mode ?? 'template';
  // ai-selection sends the selected text as the request text; templates send ''.
  return { ...common, mode, text: mode === 'ai-selection' ? args.text : '', template_params: fields, prev_gen_id: '', suggested_output_len: args.wordCount, content: args.html };
}

/** The analysis context the app attaches to term-aware AI calls (autoinsert, AI internal links, facts). */
export function readAiContext(): Record<string, unknown> {
  return {
    project: PROJECT_SIG,
    analysis: contadu_analysis_sig,
    language: typeof analysis_language !== 'undefined' ? analysis_language : '',
    content_terms: get_content_terms_to_check(),
    custom_h1_terms: Object.values(typeof custom_h1_content_terms_by_id !== 'undefined' ? custom_h1_content_terms_by_id : {}),
    custom_h2_terms: Object.values(typeof custom_h2_content_terms_by_id !== 'undefined' ? custom_h2_content_terms_by_id : {}),
    custom_content_terms: Object.values(typeof custom_content_terms_by_id !== 'undefined' ? custom_content_terms_by_id : {}),
    custom_terms_ranges: typeof custom_terms_ranges !== 'undefined' ? custom_terms_ranges : {},
    terms_suggested_usage: typeof terms_suggested_usage !== 'undefined' ? terms_suggested_usage : {},
  };
}

/** The user's saved AI templates (custom_ai_templates_definition). */
export function readCustomTemplates(): unknown {
  return typeof custom_ai_templates_definition !== 'undefined' ? custom_ai_templates_definition : {};
}
