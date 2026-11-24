import { useStore } from '../lib/store';
import { fullName } from '../lib/format';
import type { Person } from '../lib/types';
import { Avatar } from './common';

/** The word being typed after "@" at the caret, if any: e.g. "@Rag" → { at: index of @, query: "Rag" } */
export function mentionQuery(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[\s(])@([^\s@\[\]()]{0,24}(?: [^\s@\[\]()]{0,24})?)$/);
  if (!m) return null;
  return { at: caret - m[2].length - 1, query: m[2] };
}

/** Best matches for a mention: people who have joined first (they get the notice), then living, then everyone. */
export function mentionMatches(persons: Person[], joined: Set<string>, query: string, myId: string | null, max = 6): Person[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const score = (p: Person) => {
    const name = `${p.given_name} ${p.surname || ''} ${p.birth_surname || ''}`.toLowerCase();
    if (words.length && !words.every((w) => name.split(/[\s().]+/).some((part) => part.startsWith(w)) || name.includes(w))) return -1;
    let s = 0;
    if (joined.has(p.id)) s += 100;
    if (p.is_living) s += 10;
    if (q && p.given_name.toLowerCase().startsWith(q)) s += 20;
    return s;
  };
  return persons.filter((p) => p.id !== myId).map((p) => [p, score(p)] as const).filter(([, s]) => s >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].given_name.localeCompare(b[0].given_name)).slice(0, max).map(([p]) => p);
}

export const mentionToken = (p: Person) => `@[${fullName(p).replace(/[\[\]\n]/g, '').slice(0, 80)}](person:${p.id}) `;

export function MentionMenu({ items, active, onPick, joined }: { items: Person[]; active: number; onPick: (p: Person) => void; joined: Set<string> }) {
  const { family } = useStore();
  if (!items.length) return <div className="mention-menu"><p className="mention-empty">No one by that name. Keep typing, or press Esc.</p></div>;
  return (
    <div className="mention-menu" role="listbox" aria-label="Mention someone">
      {items.map((p, i) => {
        const par = (family.parents.get(p.id) || []).map((x) => family.byId.get(x)?.given_name).filter(Boolean).join(' & ');
        return (
          <div key={p.id} role="option" aria-selected={i === active} className={`mention-opt${i === active ? ' act' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); onPick(p); }}>
            <Avatar id={p.id} size={26} />
            <span><b>{fullName(p)}</b><small>{joined.has(p.id) ? 'On the site · will be told' : p.is_living ? 'Not on the site yet' : 'Remembered'}{par ? ` · ${p.gender === 'f' ? 'daughter' : 'son'} of ${par}` : ''}</small></span>
          </div>
        );
      })}
    </div>
  );
}
