import type { Family } from './family';
import { FIELD_LABEL, type Snapshot } from './types';

export interface Update {
  key: string;
  at: string;              // ISO time
  kind: 'join' | 'added' | 'details' | 'photo' | 'tag-request' | 'thread' | 'reply' | 'mention' | 'reply-to-you' | 'news' | 'child';
  /** where a notice opens (#/…) */
  url?: string;
  threadId?: string;
  personId?: string;
  photoId?: string;
  text: string;
  /** needs the viewer to do something (approve a tag) */
  action?: boolean;
  /** about the viewer personally (mentioned, replied to): shown first among unread */
  personal?: boolean;
  /** the reply to scroll to */
  postId?: string;
}

const DAYS = 60;

/** Set by the bell just before opening a conversation, so Talk can scroll to the reply. */
export const focus: { post: string | null } = { post: null };

/**
 * What's new for this viewer: built only from what they can already see, so the
 * database's privacy rules decide what appears here too.
 */
export function updatesFor(snap: Snapshot, f: Family, canManage: (id: string) => boolean): Update[] {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const myUid = snap.me?.user_id;
  const myId = snap.me?.person_id;
  const name = (id: string) => f.byId.get(id)?.given_name.replace(/\s*\(.*\)/, '') || 'Someone';
  const out: Update[] = [];

  // a child under 18 added something: waiting for this parent's OK (0034)
  const waiting = new Map<string, { n: number; at: string }>();
  for (const d of snap.childDrafts || []) {
    if (d.child_person === myId) continue;
    const w = waiting.get(d.child_person) || { n: 0, at: d.created_at };
    waiting.set(d.child_person, { n: w.n + 1, at: d.created_at > w.at ? d.created_at : w.at });
  }
  for (const [kid, w] of waiting) out.push({ key: 'c' + kid + w.n, at: w.at, kind: 'child', personId: kid, action: true, url: '#/child',
    text: `${name(kid)} added ${w.n === 1 ? 'something' : `${w.n} things`} for the family. Check and approve.` });
  // admins' notices to everyone: shown first among unread, like a mention
  for (const a of snap.announcements || []) {
    if (a.created_at < since) continue;
    out.push({ key: 'n' + a.id, at: a.created_at, kind: 'news', personId: a.created_person || undefined, personal: true, url: a.url,
      text: `📣 ${a.title}${a.body ? ` · ${a.body}` : ''}` });
  }
  for (const j of snap.joins) {
    if (j.person_id === myId || j.joined_at < since || !f.byId.has(j.person_id)) continue;
    out.push({ key: 'j' + j.person_id, at: j.joined_at, kind: 'join', personId: j.person_id, text: `${name(j.person_id)} joined the family website.` });
  }
  for (const p of snap.persons) {
    if (!p.created_at || p.created_at < since) continue;
    out.push({ key: 'a' + p.id, at: p.created_at, kind: 'added', personId: p.id, text: `${name(p.id)} was added to the family tree.` });
  }
  // new or changed details, one line per person per day
  const groups = new Map<string, { person: string; at: string; fields: string[] }>();
  for (const x of snap.fields) {
    if (!x.updated_at || x.updated_at < since || !x.updated_by || x.updated_by === myUid) continue;
    const k = x.person_id + x.updated_at.slice(0, 10);
    const g = groups.get(k) || { person: x.person_id, at: x.updated_at, fields: [] };
    if (x.updated_at > g.at) g.at = x.updated_at;
    g.fields.push(x.field === 'photo' ? 'a new photo' : FIELD_LABEL[x.field].toLowerCase());
    groups.set(k, g);
  }
  for (const [k, g] of groups) {
    if (!f.byId.has(g.person)) continue;
    const list = g.fields.length > 3 ? `${g.fields.slice(0, 3).join(', ')} and more` : g.fields.join(', ');
    out.push({ key: 'd' + k, at: g.at, kind: 'details', personId: g.person, text: `${name(g.person)}’s page has new details: ${list}.` });
  }
  for (const ph of snap.photos) {
    if (ph.created_at < since || ph.uploaded_by === myUid) continue;
    out.push({ key: 'p' + ph.id, at: ph.created_at, kind: 'photo', photoId: ph.id, text: ph.caption ? `New photo: ${ph.caption}` : 'A new family photo was shared.' });
  }
  // Talk: new conversations, and replies in conversations you started or joined
  const mineThreads = new Set([...snap.threads.filter((t) => t.author === myUid).map((t) => t.id), ...snap.recentPosts.filter((p) => p.author === myUid).map((p) => p.thread_id)]);
  const title = new Map(snap.threads.map((t) => [t.id, t.title]));
  for (const t of snap.threads) {
    if (t.created_at < since || t.author === myUid) continue;
    out.push({ key: 'th' + t.id, at: t.created_at, kind: 'thread', threadId: t.id, personId: t.author_person || undefined,
      text: `${t.author_person ? name(t.author_person) : 'Someone'} started a conversation: ${t.title}` });
  }
  // personal: someone mentioned you, or replied to something you wrote
  const personalPosts = new Set<string>();
  if (myId) {
    for (const t of snap.threads) {
      if (t.created_at < since || t.author === myUid || !t.mentions?.includes(myId)) continue;
      out.push({ key: 'mt' + t.id, at: t.created_at, kind: 'mention', threadId: t.id, personId: t.author_person || undefined, personal: true,
        text: `${t.author_person ? name(t.author_person) : 'Someone'} mentioned you in “${t.title}”.` });
    }
    const myPosts = new Set(snap.recentPosts.filter((p) => p.author === myUid).map((p) => p.id));
    for (const p of snap.recentPosts) {
      if (p.author === myUid || !title.has(p.thread_id)) continue;
      const who = p.author_person ? name(p.author_person) : 'Someone';
      if (p.mentions?.includes(myId)) {
        out.push({ key: 'mp' + p.id, at: p.created_at, kind: 'mention', threadId: p.thread_id, postId: p.id, personId: p.author_person || undefined, personal: true,
          text: `${who} mentioned you in “${title.get(p.thread_id)}”.` });
        personalPosts.add(p.id);
      } else if (p.reply_to && myPosts.has(p.reply_to)) {
        out.push({ key: 'rp' + p.id, at: p.created_at, kind: 'reply-to-you', threadId: p.thread_id, postId: p.id, personId: p.author_person || undefined, personal: true,
          text: `${who} replied to you in “${title.get(p.thread_id)}”.` });
        personalPosts.add(p.id);
      }
    }
  }
  const replies = new Map<string, { at: string; who: Set<string>; n: number }>();
  for (const p of snap.recentPosts) {
    if (p.author === myUid || personalPosts.has(p.id) || !mineThreads.has(p.thread_id) || !title.has(p.thread_id)) continue;
    const g = replies.get(p.thread_id) || { at: p.created_at, who: new Set<string>(), n: 0 };
    if (p.created_at > g.at) g.at = p.created_at;
    g.n++; if (p.author_person) g.who.add(p.author_person);
    replies.set(p.thread_id, g);
  }
  for (const [tid, g] of replies) {
    const names = [...g.who].map(name);
    const who = names.length === 0 ? 'Someone' : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`;
    out.push({ key: 'r' + tid + g.at, at: g.at, kind: 'reply', threadId: tid, personId: [...g.who][0],
      text: `${who} replied in “${title.get(tid)}”${g.n > 1 ? ` (${g.n} replies)` : ''}.` });
  }

  // tags waiting for the viewer (or someone they look after); shown until decided
  for (const t of snap.tags) {
    if (t.status !== 'pending' || !canManage(t.person_id) || snap.me?.role === 'admin' && t.person_id !== myId) continue;
    const who = t.person_id === myId ? 'You were' : `${name(t.person_id)} was`;
    out.push({ key: 't' + t.photo_id + t.person_id, at: t.created_at, kind: 'tag-request', photoId: t.photo_id, personId: t.person_id, action: true, text: `${who} tagged in a photo. Approve it or hide it.` });
  }
  return out.sort((a, b) => (Number(!!b.action) - Number(!!a.action)) || b.at.localeCompare(a.at)).slice(0, 40);
}

/** Unread personal items (mentions, replies to you) float to the top, after anything waiting for a decision. */
export function orderForBell(items: Update[], seenAt: string | null): Update[] {
  const unreadPersonal = (u: Update) => !!u.personal && (!seenAt || u.at > seenAt);
  return [...items].sort((a, b) => (Number(!!b.action) - Number(!!a.action)) || (Number(unreadPersonal(b)) - Number(unreadPersonal(a))) || b.at.localeCompare(a.at));
}

/** How many updates arrived since the bell was last opened. Requests always count. */
export function unreadCount(items: Update[], seenAt: string | null): number {
  return items.filter((u) => u.action || !seenAt || u.at > seenAt).length;
}
