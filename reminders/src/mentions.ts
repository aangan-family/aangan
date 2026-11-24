/** "Someone mentioned you in Talk": one email per person per run, listing each new mention. */
import { box, button, esc, layout, p, SITE } from './brand.ts';

export interface MentionRow {
  id: number; user_id: string; email: string; given_name: string; by_name: string | null;
  thread_id: string; post_id: string | null; title: string; body: string; at: string;
}

/** Readable excerpt: mentions become @Name, formatting goes, at most ~180 characters. */
export function excerpt(body: string, max = 180): string {
  const t = body.replace(/!\[([^\]\n]{0,200})\]\(photo:[0-9a-fA-F-]{36}\)/g, (_m, c: string) => `📷 ${c.trim() || 'Photo'}`)
    .replace(/@\[([^\]\n]{1,80})\]\(person:[A-Za-z0-9]{1,20}\)/g, '@$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/[*~]{1,2}|^#{2,3}\s+|^>\s?|^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

/** Group the queue by person: one email each. */
export function groupByPerson(rows: MentionRow[]): MentionRow[][] {
  const m = new Map<string, MentionRow[]>();
  for (const r of rows) m.set(r.user_id, [...(m.get(r.user_id) || []), r]);
  return [...m.values()];
}

export function mentionEmail(rows: MentionRow[]) {
  const first = rows[0];
  const who = (r: MentionRow) => r.by_name || 'Someone in the family';
  const link = (r: MentionRow) => `${SITE}/#/talk/${r.thread_id}`;
  const one = rows.length === 1;
  const subject = one ? `${who(first)} mentioned you in “${first.title}”` : `You were mentioned ${rows.length} times in Talk`;
  const items = rows.map((r) => box(
    `<p style="margin:0 0 4px;font-size:14px;color:#6e6e73"><b style="color:#1d1d1f">${esc(who(r))}</b> in <a href="${link(r)}" style="color:#0066cc;text-decoration:none">${esc(r.title)}</a></p>
<p style="margin:0;font-size:16px;line-height:1.5;color:#1d1d1f">${esc(excerpt(r.body))}</p>`)).join('\n');
  const html = layout({
    preheader: one ? `${who(first)}: ${excerpt(first.body, 90)}` : `${rows.length} new mentions in Talk.`,
    headline: one ? 'You were mentioned.' : `${rows.length} new mentions.`,
    body: [
      p(`Hi ${esc(first.given_name)}, ${one ? 'someone mentioned you' : 'family members mentioned you'} in Talk on the family website.`),
      items,
      button(link(first), one ? 'Open the conversation' : 'Open Talk'),
      p(`Don’t want these emails? Turn them off in <a href="${SITE}/#/privacy" style="color:#6e6e73">My privacy</a>. Mentions still show in your bell.`, 'font-size:13px;color:#6e6e73'),
    ].join('\n'),
  });
  const text = [
    `Hi ${first.given_name}, ${one ? 'someone mentioned you' : 'family members mentioned you'} in Talk:`, '',
    ...rows.flatMap((r) => [`${who(r)} in “${r.title}”:`, excerpt(r.body), link(r), '']),
    `Turn these emails off: ${SITE}/#/privacy`,
  ].join('\n');
  return { subject, html, text };
}
