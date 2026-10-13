// The create wizard's project_keywords did not persist (2026-10-13); set them through settings instead.
import { live } from './harness.mjs';
const keywords = [
  'تنفيذ بحيرات تجمع مياه السيول', 'تصريف السيول', 'تصريف مياه الأمطار', 'تجميع مياه الأمطار', 'مقاول ترميم', 'مقاول هناجر',
  'مقاول مستودعات', 'مقاول عظم', 'مظلات بريدة', 'مشاريع القصيم', 'مقاول القصيم', 'شركة مقاولات القصيم', 'مقاول بناء القصيم',
  'مقاول بريدة', 'شركة مقاولات بريدة', 'مظلات وسواتر بريدة', 'مقاول تسليم مفتاح', 'مقاول عظم بالمواد', 'مقاول بناء بريدة',
  'مقاول عظم بالقصيم', 'مقاول أسفلت', 'سفلتة شوارع', 'سفلتة طرق',
];
await live('atala-keywords', async ({ step, log }) => {
  const s = await step('nw_update_project_settings', { project: 'c4e17fb2aa86f36b', keywords: { desired: keywords } });
  log('desired', s?.keywords?.desired?.length, '| brand', s?.keywords?.brand?.length, '| overview kept', Boolean(s?.ai_profile?.overview), '| competitors kept', s?.domains?.competitors?.length);
});
