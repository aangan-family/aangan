// Woven borders: plain data and rules, shared by the website (lib/heritage.ts) and the Worker's emails. No imports.

/**
 * Woven borders from each community's traditional dress, drawn in components/Textiles.tsx (and Heritage.tsx for the
 * first four) and sent as PNGs in emails (web/public/email/<id>.png, `npm run email-art`). `who` is whose dress it is
 * usually: it decides the default, but anyone may pick any border of their traditions in Theme.
 * Keep in step with the check on member_prefs.border (0052).
 */
export interface Textile { id: string; name: string; from: string; who?: 'm' | 'f' }
export const TEXTILES: Textile[] = [
  { id: 'veshti-red', name: 'Veshti · Red', from: 'Mayil kann veshti, Tamil Nadu', who: 'm' },
  { id: 'veshti-blue', name: 'Veshti · Blue', from: 'Mayil kann veshti, Tamil Nadu', who: 'm' },
  { id: 'saree-green', name: 'Saree · Green', from: 'Kanjeevaram saree', who: 'f' },
  { id: 'saree-red', name: 'Saree · Red', from: 'Kanjeevaram saree', who: 'f' },
  { id: 'kasavu', name: 'Kasavu', from: 'Kerala mundu and set saree' },
  { id: 'pochampally', name: 'Pochampally', from: 'Telangana ikat saree', who: 'f' },
  { id: 'ilkal', name: 'Ilkal', from: 'North Karnataka saree', who: 'f' },
  { id: 'mysore-peta', name: 'Mysore peta', from: 'Mysore turban', who: 'm' },
  { id: 'banarasi', name: 'Banarasi', from: 'Varanasi silk saree', who: 'f' },
  { id: 'leheriya', name: 'Leheriya', from: 'Rajasthani safa and dupatta', who: 'm' },
  { id: 'phulkari', name: 'Phulkari', from: 'Punjabi embroidered dupatta', who: 'f' },
  { id: 'khes', name: 'Khes', from: 'Punjabi woven cotton', who: 'm' },
  { id: 'bandhani', name: 'Bandhani', from: 'Gujarati tie-dye', who: 'f' },
  { id: 'ajrak', name: 'Ajrak', from: 'Kutch and Sindh block print' },
  { id: 'paithani', name: 'Paithani', from: 'Maharashtrian silk saree', who: 'f' },
  { id: 'pheta', name: 'Pheta', from: 'Maharashtrian turban', who: 'm' },
  { id: 'laal-paar', name: 'Laal paar', from: 'Bengali red-bordered saree', who: 'f' },
  { id: 'dhuti', name: 'Dhuti', from: 'Bengali dhoti', who: 'm' },
  { id: 'chikankari', name: 'Chikankari', from: 'Lucknow embroidery' },
  { id: 'zardozi', name: 'Zardozi', from: 'Gold embroidery', who: 'm' },
  { id: 'sambalpuri', name: 'Sambalpuri', from: 'Odisha ikat' },
  { id: 'mekhela', name: 'Mekhela', from: 'Assamese muga silk', who: 'f' },
  { id: 'gamosa', name: 'Gamosa', from: 'Assamese woven cloth', who: 'm' },
  { id: 'kunbi', name: 'Kunbi', from: 'Goan checked saree' },
  { id: 'kani', name: 'Kani paisley', from: 'Kashmiri shawl' },
  { id: 'gara', name: 'Gara', from: 'Parsi embroidered saree' },
];
export const TEXTILE = new Map(TEXTILES.map((t) => [t.id, t]));
export type Border = string;

/** Each tradition's borders, in order of preference. A tradition with none (English) shows no border. */
export const COMMUNITY_TEXTILES: Record<string, string[]> = {
  tamil: ['veshti-red', 'veshti-blue', 'saree-green', 'saree-red'],
  malayalam: ['veshti-red', 'veshti-blue', 'saree-green', 'saree-red', 'kasavu'],
  telugu: ['veshti-red', 'veshti-blue', 'pochampally'],
  kannada: ['mysore-peta', 'ilkal'],
  hindi: ['leheriya', 'banarasi'],
  punjabi: ['khes', 'phulkari'],
  gujarati: ['ajrak', 'bandhani'],
  marathi: ['pheta', 'paithani'],
  bengali: ['dhuti', 'laal-paar'],
  urdu: ['zardozi', 'chikankari'],
  odia: ['sambalpuri'],
  assamese: ['gamosa', 'mekhela'],
  konkani: ['kunbi'],
  goan_catholic: ['kunbi'],
  sindhi: ['ajrak'],
  kashmiri: ['kani'],
  parsi: ['gara'],
  syrian_christian: ['kasavu'],
  english: [],
};
/** The South's first four keep the old rule: veshti for men, saree for women. */
const GENDERED = new Set(['veshti-red', 'veshti-blue', 'saree-green', 'saree-red']);

/** The borders someone can choose in Theme, for their traditions. */
export function borderChoices(gender: string, community = 'tamil'): Border[] {
  const all = COMMUNITY_TEXTILES[community] ?? [];
  return all.filter((id) => !GENDERED.has(id) || (gender === 'm' ? id.startsWith('veshti') : gender === 'f' ? id.startsWith('saree') : false));
}
/** Their chosen border if it's one we draw; otherwise their traditions' default for them; null when the traditions have none. */
export function borderFor(gender: string, pref?: string | null, community = 'tamil'): Border | null {
  const gendered = (id: string) => GENDERED.has(id) && !(gender === 'm' ? id.startsWith('veshti') : gender === 'f' ? id.startsWith('saree') : false);
  if (pref && TEXTILE.has(pref) && !gendered(pref)) return pref;   // a veshti only for men, a saree only for women
  const all = COMMUNITY_TEXTILES[community] ?? [];
  if (!all.length) return null;
  const mine = all.find((id) => TEXTILE.get(id)!.who === gender) ?? borderChoices(gender, community)[0];
  return mine ?? (GENDERED.has(all[0]) ? 'saree-green' : all[0]);
}
export const borderName = (id: string) => TEXTILE.get(id)?.name ?? id;

