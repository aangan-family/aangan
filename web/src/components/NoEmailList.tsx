import { useMemo, useState } from 'react';
import { DOMAIN } from '../lib/site';
import { useStore } from '../lib/store';
import { siblingsOf } from '../lib/family';
import { firstName, fullName } from '../lib/format';
import { InviteSheet } from './Sheets';

export interface Missing {
  id: string;
  name: string;
  branch: string;           // which branch of the family (child of the root couple), or ''
  parents: string;          // "Ramesh & Uma"
  ask: string[];            // close relatives who have joined and could ask them
  email: string | null;     // an email already on their profile, if the admin can see it
  phone: string | null;     // a phone on their profile, to ask them directly
}

/** Living adults who haven't joined and have no open invitation: we don't have their email yet. */
export function useMissing(): Missing[] {
  const { snap, family, isMinor } = useStore();
  return useMemo(() => {
    const joined = new Set(snap.joined), invited = new Set(snap.invited);
    const field = (id: string, f: string) => snap.fields.find((x) => x.person_id === id && x.field === f && x.value.trim())?.value.trim() || null;
    const nm = (id: string) => fullName(family.byId.get(id));
    const out: Missing[] = [];
    for (const p of snap.persons) {
      if (!p.is_living || joined.has(p.id) || invited.has(p.id) || isMinor(p.id)) continue;
      const near = [...(family.spouses.get(p.id) || []), ...(family.parents.get(p.id) || []), ...(family.children.get(p.id) || []), ...siblingsOf(family, p.id)];
      const ask = [...new Set(near)].filter((x) => joined.has(x)).map(nm);
      const ps = family.parents.get(p.id) || [];
      const b = family.branch.get(p.id) || family.via.get(p.id) || '';
      out.push({
        id: p.id, name: nm(p.id), branch: b ? nm(b) : '',
        parents: ps.map((x) => firstName(family.byId.get(x))).join(' & '),
        ask, email: field(p.id, 'email'), phone: field(p.id, 'phone'),
      });
    }
    return out.sort((a, b) => a.branch.localeCompare(b.branch) || (family.gen.get(a.id) ?? 99) - (family.gen.get(b.id) ?? 99) || a.name.localeCompare(b.name));
  }, [snap, family, isMinor]);
}

/** Plain text for WhatsApp: who we still need an email for, and who could ask them. */
export function missingText(list: Missing[]): string {
  const lines = [`*Relatives we still need an email address for* (${DOMAIN})`, ''];
  let branch: string | null = null;
  for (const m of list) {
    if (m.branch !== branch) { branch = m.branch; lines.push('', `_${branch ? `${branch}’s family` : 'Others'}_`); }
    lines.push(`• ${m.name}${m.parents ? ` (child of ${m.parents})` : ''}${m.ask.length ? ` — ask ${m.ask.join(', ')}` : ''}`);
  }
  lines.push('', 'If you know any of these email addresses, please send them to me.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function NoEmailList() {
  const { toast } = useStore();
  const all = useMissing();
  const [q, setQ] = useState('');
  const [who, setWho] = useState<Missing | null>(null);
  const list = all.filter((m) => !q || `${m.name} ${m.parents} ${m.branch} ${m.ask.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const onFile = all.filter((m) => m.email).length;
  const groups: [string, Missing[]][] = [];
  for (const m of list) { const g = groups[groups.length - 1]; if (g && g[0] === m.branch) g[1].push(m); else groups.push([m.branch, [m]]); }
  const text = missingText(list);
  async function copy() { try { await navigator.clipboard.writeText(text); toast('List copied. Paste it into WhatsApp.'); } catch { toast('Couldn’t copy. Long-press to select the list instead.'); } }

  return (
    <section>
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 26 }}>Still need an email.</h3>
        <p><b>{all.length}</b> living adult{all.length === 1 ? '' : 's'} in the tree haven’t joined and haven’t been invited, because we don’t have their email yet.
          {onFile ? <> <b>{onFile}</b> already {onFile === 1 ? 'has an email' : 'have an email'} on their profile: invite them in one tap.</> : null} For the rest, ask a close relative who has joined, shown next to each name. Children under 18 aren’t listed.</p>
        <div className="nemail-tools">
          <input type="search" placeholder="Search by name, branch or relative…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the list" />
          <button className="btn" onClick={copy} disabled={!list.length}>Copy list</button>
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
        </div>
      </div>
      {groups.map(([branch, ms]) => (
        <div key={branch || '-'} className="nemail-group">
          <h5 className="vh">{branch ? `${branch}’s family` : 'Others'} · {ms.length}</h5>
          <ul className="nemail">{ms.map((m) => (
            <li key={m.id}>
              <div className="nemail-who">
                <a href={`#/p/${m.id}`}><b>{m.name}</b></a>
                {m.parents && <span> · child of {m.parents}</span>}
                <div className="nemail-ask">{m.email ? <>Email on profile: <b>{m.email}</b></>
                  : m.ask.length ? <>Ask {m.ask.join(', ')}</> : <>No close relative has joined yet</>}
                  {m.phone && <> · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a></>}</div>
              </div>
              <button className={`btn${m.email ? ' primary' : ''}`} onClick={() => setWho(m)}>Invite</button>
            </li>
          ))}</ul>
        </div>
      ))}
      {!list.length && <p className="emptyhint" style={{ textAlign: 'center', marginTop: 30 }}>{all.length ? 'No one matches.' : 'Everyone who can be invited has been. 🎉'}</p>}
      {who && <InviteSheet id={who.id} initialEmail={who.email || ''} onClose={() => setWho(null)} />}
    </section>
  );
}
