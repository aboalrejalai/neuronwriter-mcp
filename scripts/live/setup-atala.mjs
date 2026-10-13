// One-off (owner-approved 2026-10-13): create the Atlalat Najd project and fill its settings
// from the site's own docs (~/Desktop/Project/atalanajd/docs). Nothing here is reverted on purpose.
import { live } from './harness.mjs';

const keywords = [
  'تنفيذ بحيرات تجمع مياه السيول', 'تصريف السيول', 'تصريف مياه الأمطار', 'تجميع مياه الأمطار', 'مقاول ترميم', 'مقاول هناجر',
  'مقاول مستودعات', 'مقاول عظم', 'مظلات بريدة', 'مشاريع القصيم', 'مقاول القصيم', 'شركة مقاولات القصيم', 'مقاول بناء القصيم',
  'مقاول بريدة', 'شركة مقاولات بريدة', 'مظلات وسواتر بريدة', 'مقاول تسليم مفتاح', 'مقاول عظم بالمواد', 'مقاول بناء بريدة',
  'مقاول عظم بالقصيم', 'مقاول أسفلت', 'سفلتة شوارع', 'سفلتة طرق',
];

await live('setup-atala', async ({ step, log }) => {
  const existing = (await step('nw_list_projects')).projects.find((p) => p.name.includes('atalanajd'));
  const projectId = existing?.id ?? (await step('nw_create_project', {
    mode: 'domain', domain_or_name: 'atalanajd.com', engine: 'google.com.sa', language: 'Arabic', keywords, confirm: true,
  }))?.project_id;
  log('project', projectId);
  if (!projectId) return;
  const settings = await step('nw_update_project_settings', {
    project: projectId,
    keywords: { brand: ['أطلالة نجد', 'اطلالة نجد', 'مؤسسة أطلالة نجد للمقاولات العامة'] },
    domains: {
      competitors: ['afdal10.com', 'moqawil-qassim.com', 'wastalqassim.com', 'alrawaf.com.sa', 'msaken-aljazeera.com', 'tamayimconstruction.com'],
      excluded: ['haraj.com.sa', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'facebook.com', 'tiktok.com', 'snapchat.com'],
    },
    ai_profile: {
      overview: 'أطلالة نجد مؤسسة مقاولات عامة في بريدة بمنطقة القصيم، خبرتها أكثر من 20 سنة في المقاولات، وعملت في مناطق المملكة من الجوف إلى تبوك، وتركيزها الحالي بريدة والقصيم. تنفذ البناء والعظم وتسليم المفتاح والترميم والهناجر والمستودعات والمظلات والسواتر والأسفلت وتصريف السيول والأمطار. الدوام كل أيام الأسبوع من 8:00 إلى 18:00.',
      products_pricing: 'الخدمات: مقاول بناء، مقاول عظم، تسليم مفتاح (الخامات يختارها العميل أو المنشأة)، ترميم، هناجر، مستودعات، مظلات وسواتر، أسفلت وسفلتة شوارع وطرق، تصريف السيول ومياه الأمطار وبحيرات تجميع مياه السيول. الأسعار لا تُذكر في المحتوى؛ التسعير بعد المعاينة والتواصل.',
      labeling_entities: 'أطلالة نجد، مؤسسة أطلالة نجد للمقاولات العامة، بريدة، القصيم، المملكة العربية السعودية، مقاول، مقاولات عامة، تسليم مفتاح، عظم، ترميم، هناجر، مستودعات، مظلات، سواتر، أسفلت، تصريف السيول.',
      personas: 'ملاك منازل وفلل في بريدة والقصيم يبنون أو يرممون؛ أصحاب أعمال ومزارع يحتاجون هناجر ومستودعات ومظلات وسواتر؛ ملاك أراضٍ ومخططات يحتاجون سفلتة وتصريف سيول وأمطار.',
      brand_voice: 'عربي فصيح واضح وقريب، عملي ومباشر. يذكر الحقائق المثبتة فقط: خبرة أكثر من 20 سنة، العمل في بريدة والقصيم ومناطق المملكة. لا يذكر الأسعار ولا الضمان ولا عدد المشاريع ولا كلمة «أفضل».',
    },
  });
  log(JSON.stringify({ name: settings?.name, homepage: settings?.homepage, engine: settings?.engine, language: settings?.language, desired: settings?.keywords?.desired?.length, brand: settings?.keywords?.brand, domains: settings?.domains, ai_profile_overview: settings?.ai_profile?.overview?.slice(0, 60) }));
});
