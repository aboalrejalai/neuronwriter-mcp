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
  return { ...common, template_params: fields, prev_gen_id: '', suggested_output_len: args.wordCount, content: args.html };
}
