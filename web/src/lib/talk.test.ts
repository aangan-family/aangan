import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { updatesFor } from './updates';
import { plain } from '../pages/Talk';
import type { Person, Snapshot } from './types';

const P = (id: string): Person => ({ id, given_name: id, surname: '', birth_surname: '', gender: 'm', birth_year: 1970, is_living: true, death_date: null, death_place: null, sort_key: null });
const f = buildFamily([P('A'), P('B'), P('C')], [], []);
const now = new Date().toISOString();
const t = (id: string, author: string, person: string) => ({ id, title: 'T' + id, body: 'x', category: 'recipes', author, author_person: person, pinned: false, locked: false, reply_count: 0, created_at: now, edited_at: null, last_activity_at: now });

describe('Talk', () => {
  it('previews drop the formatting', () => {
    expect(plain('## Sambar\n- **Toor dal** 1 cup\n- *Tamarind* [video](https://x.y)')).toBe('Sambar Toor dal 1 cup Tamarind video');
  });
  it('bell: new conversations by others, replies where I took part, never my own', () => {
    const snap = {
      persons: [P('A'), P('B'), P('C')], links: [], partners: [], fields: [], joins: [], photos: [], tags: [], consents: [], joined: [], invited: [], policy: null, info: null,
      me: { user_id: 'ua', person_id: 'A', role: 'member', status: 'active' }, prefs: { theme: 'blue', updates_seen_at: null },
      threads: [t('1', 'ua', 'A'), t('2', 'ub', 'B'), t('3', 'uc', 'C')],
      recentPosts: [
        { id: 'p1', thread_id: '1', author: 'ub', author_person: 'B', created_at: now },   // reply in my thread
        { id: 'p2', thread_id: '1', author: 'uc', author_person: 'C', created_at: now },
        { id: 'p3', thread_id: '3', author: 'ua', author_person: 'A', created_at: now },   // I joined thread 3
        { id: 'p4', thread_id: '3', author: 'ub', author_person: 'B', created_at: now },
        { id: 'p5', thread_id: '2', author: 'uc', author_person: 'C', created_at: now },   // not mine: no reply note
      ],
    } as unknown as Snapshot;
    const u = updatesFor(snap, f, () => false);
    expect(u.filter((x) => x.kind === 'thread').map((x) => x.threadId).sort()).toEqual(['2', '3']);
    const r = u.filter((x) => x.kind === 'reply');
    expect(r.map((x) => x.threadId).sort()).toEqual(['1', '3']);
    expect(r.find((x) => x.threadId === '1')!.text).toBe('B and C replied in “T1” (2 replies).');
  });
});
