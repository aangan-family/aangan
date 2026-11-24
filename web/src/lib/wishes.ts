import type { Family } from './family';
import { firstName } from './format';
import { describe } from './kinship';
import { tamilTerm } from './tamil';
import type { Upcoming } from './traditions';

/**
 * Who `other` is to `me`, short enough to sit next to a name: "your elder sister", "your wife’s uncle".
 * Built from the same relationship sentence the "How are we related?" page uses.
 */
export function relationToMe(f: Family, other: string, me: string | null): string | null {
  if (!me || other === me || !f.byId.has(me)) return null;
  const s = describe(f, other, me).sentence;
  const at = (i: number) => s[i];
  const isMe = (i: number) => at(i)?.t === 'name' && (at(i) as { id: string }).id === me;
  const txt = (i: number) => (at(i) && at(i).t !== 'name' ? (at(i) as { s: string }).s : '');
  // "A is B’s X."
  if (txt(1) === ' is ' && isMe(2) && txt(3) === '’s ' && at(4)?.t === 'rel') return `your ${txt(4)}`;
  // "A is the X of B’s wife, S."
  if (txt(1) === ' is the ' && at(2)?.t === 'rel' && txt(3) === ' of ' && isMe(4)) {
    const m = txt(5).match(/^’s (.+), $/);
    if (m) return `your ${m[1]}’s ${txt(2)}`;
  }
  // "A’s wife S is the X of B’s husband, T."
  const ri = s.findIndex((x) => x.t === 'rel');
  if (ri > 0 && txt(ri - 1) === ' is the ' && txt(ri + 1) === ' of ' && isMe(ri + 2)) {
    const m = txt(ri + 3).match(/^’s (.+), $/); const sp = txt(1).match(/^’s (\w+) $/);
    if (m && sp) return `married to your ${m[1]}’s ${txt(ri)}`;
  }
  return null;
}

/** What you'd call them when writing: the Tamil word for elders ("Akka", "Periyappa"), otherwise their first name. */
export function addressAs(f: Family, other: string, me: string | null): string {
  const p = f.byId.get(other);
  const name = p ? firstName(p) : '';
  if (!me) return name;
  const t = tamilTerm(f, other, me);
  const meP = f.byId.get(me);
  const elder = !!(p?.birth_year && meP?.birth_year && p.birth_year < meP.birth_year);
  if (t && elder && !t.includes('/')) return t;
  return name;
}

const when = (d: Date) => {
  const n = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `on ${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}`;
};

/** Who gets the wish: the person, or for an anniversary the partner you're related to by blood (else the one who has joined). */
export function wishRecipient(f: Family, u: Upcoming, me: string | null, joined: Set<string>): string | null {
  if (u.kind === 'remembrance' || u.kind === 'shraddham') return null;
  const people = [u.id, u.with].filter((x): x is string => !!x && x !== me && joined.has(x) && !!f.byId.get(x)?.is_living);
  if (!people.length) return null;
  if (people.length === 1 || !me) return people[0];
  const close = people.find((x) => (relationToMe(f, x, me) || '').match(/^your (?!\w+’s |\w+-in-law)/));
  return close || people[0];
}

/** A warm, ready-to-send message for the occasion. */
export function wishText(f: Family, u: Upcoming, to: string, me: string | null): string {
  const hi = `Hi ${addressAs(f, to, me)}`;
  const day = when(u.date);
  switch (u.kind) {
    case 'birthday': return `${hi}, wishing you a very happy birthday ${day}! 🎂🎉 Have a wonderful year ahead. 🙏`;
    case 'milestone': return `${hi}, wishing you a very happy ${u.sub.replace(/ year$/, '')} ${day}! 🙏🎉 ${u.title.replace('Turns', 'Turning')} is a blessing for all of us. Wishing you good health and happiness always.`;
    case 'tamil-birthday': return `${hi}, happy Tamil birthday (${u.sub}) ${day}! 🪔🙏 Wishing you good health and happiness.`;
    case 'anniversary': {
      const other = u.with === to ? u.id : u.with;
      const partner = other ? firstName(f.byId.get(other)) : '';
      return `${hi}, happy wedding anniversary${partner ? ` to you and ${partner}` : ''} ${day}! 💐 Wishing you both many more happy years together. 🙏`;
    }
    default: return `${hi} 🙏`;
  }
}

/** Set just before opening Messages, so the conversation starts with the wish typed in. */
export const draft: { person: string | null; text: string } = { person: null, text: '' };
