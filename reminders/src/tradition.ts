/**
 * The family's own traditions (site.config.json "community"), for wording in emails, so every family's emails
 * speak of their own calendar and family words, not one community's.
 */
import cfg from '../../site.config.json' with { type: 'json' };
import { PACKS, type CommunityId } from '../../web/src/lib/community/packs';
import type { Role } from '../../web/src/lib/kin/roles';

export const PACK = PACKS[(cfg.community as CommunityId)] ?? PACKS.english;

const role = (key: Role['key'], sex: 'm' | 'f', side?: 'P' | 'M', older: boolean | null = null): Role => ({ key, sex, ego: 'm', side, older });
/** A few family words in the family's language, e.g. "Chacha, Bua, Mama and Mausi"; empty for English. */
export function kinExamples(): string {
  if (PACK.id === 'english') return '';
  const words = [role('parent_sibling', 'm', 'P', false), role('parent_sibling', 'f', 'P'), role('parent_sibling', 'm', 'M'), role('parent_sibling', 'f', 'M', true)]
    .map((r) => PACK.term(r)?.word?.replace(/ ji$/, '')).filter((w): w is string => !!w);
  const uniq = [...new Set(words.map((w) => w.toLowerCase()))].map((w) => words.find((x) => x.toLowerCase() === w)!);
  return uniq.length > 1 ? `${uniq.slice(0, -1).join(', ')} and ${uniq.at(-1)}` : uniq.join('');
}

/** What the calendar marks every day, in the family's date style; empty when it marks nothing special. */
export function calendarDays(): string {
  switch (PACK.date) {
    case 'tamil': return 'Tamil dates, nakshatram and tithi';
    case 'malayalam': return 'Malayalam dates, nakshatram and tithi';
    case 'bengali': return 'Bengali dates and tithi';
    case 'odia': return 'Odia dates and tithi';
    case 'assamese': return 'Assamese dates and tithi';
    case 'amanta': case 'purnimanta': return 'tithi and the lunar months';
    case 'hijri': return 'Hijri dates';
    default: return '';
  }
}

/** The family's own days the calendar keeps. */
export function ownDays(): string {
  const hindu = PACK.festivals.includes('hindu');
  return [
    'birthdays',
    PACK.starBirthday ? 'star birthdays' : '',
    'remembrance days',
    hindu ? 'shraddham' : '',
    'wedding anniversaries',
  ].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' and $1');
}
