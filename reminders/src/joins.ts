/** "Someone asked to join": emailed to stewards and admins when a request arrives. */
import { box, button, DOMAIN, esc, layout, p, SITE } from './brand.ts';

export interface JoinRow {
  id: string; full_name: string; father_name: string; mother_name: string; spouse_name: string; city: string; note: string; approvers: string | null;
}

export function joinNotice(r: Omit<JoinRow, 'id' | 'approvers'>) {
  const rows: [string, string][] = [
    ['Name', r.full_name], ['Father', r.father_name], ['Mother', r.mother_name], ['Husband or wife', r.spouse_name], ['City', r.city], ['Their note', r.note],
  ].filter(([, v]) => v && v.trim()) as [string, string][];
  const html = layout({
    preheader: `${r.full_name} asked to join the family website.`,
    headline: 'Someone asked to join.',
    body: [
      p(`<b>${esc(r.full_name)}</b> signed in and asked to join ${DOMAIN}. Please check who they are, find them in the tree, and approve or decline.`),
      box(rows.map(([k, v]) => `<p style="margin:0 0 6px"><span style="color:#6e6e73">${k}:</span> ${esc(v)}</p>`).join('')),
      button(`${SITE}/#/admin/requests`, 'Review the request'),
      p('Not sure who they are? Their phone number (if they gave one) is on the request, so you can call or WhatsApp them first.', 'font-size:14px;color:#6e6e73'),
    ].join('\n'),
  });
  const text = [`${r.full_name} asked to join the family website.`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `Review: ${SITE}/#/admin/requests`].join('\n');
  return { subject: `${r.full_name} asked to join the family website`, html, text };
}

export interface InviteRow { id: string; person_name: string | null; inviter_name: string | null; approvers: string | null }

/** "An invitation needs your OK": a member invited a relative; a steward or admin checks the email is really theirs. */
export function inviteNotice(r: Omit<InviteRow, 'id' | 'approvers'>) {
  const who = r.person_name || 'a relative';
  const by = r.inviter_name || 'A family member';
  const html = layout({
    preheader: `${by} invited ${who}. Please check and approve.`,
    headline: 'An invitation needs your OK.',
    body: [
      p(`<b>${esc(by)}</b> invited <b>${esc(who)}</b> to the family website. Before the invitation works, a steward or admin checks that the email address really belongs to ${esc(who)}.`),
      button(`${SITE}/#/admin/requests`, 'Check the invitation'),
      p('If you are not sure, call or WhatsApp them and ask which email they use.', 'font-size:14px;color:#6e6e73'),
    ].join('\n'),
  });
  const text = [`${by} invited ${who} to the family website.`, 'Please check the email address is theirs and approve it:', `${SITE}/#/admin/requests`].join('\n');
  return { subject: `Please check: ${by} invited ${who}`, html, text };
}
