import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { RichText, inline, slug } from '../lib/richtext';
import type { DevDoc } from '../lib/types';
import { go } from '../components/common';
import { revealIn } from '../lib/scroll';

/**
 * #/devcenter[/<section>] — the operations handbook, for admins only.
 * The text lives in the dev_docs table (admin-only row-level security), never in the site's code.
 */
export function DevCenter({ id }: { id?: string }) {
  const { api, isAdmin, toast } = useStore();
  const [docs, setDocs] = useState<DevDoc[] | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: string; title: string; body: string; sort: number; isNew?: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.listDevDocs().then(setDocs).catch((e) => { toast(friendly(e)); setDocs([]); });
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = docs?.find((d) => d.id === id) ?? docs?.[0];
  const headings = useMemo(() => (current?.body.match(/^##\s+.+$/gm) ?? []).map((h) => h.replace(/^##\s+/, '')), [current]);
  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !docs) return [];
    const out: { doc: DevDoc; heading: string; line: string }[] = [];
    for (const d of docs) {
      let heading = d.title;
      for (const line of d.body.split('\n')) {
        if (/^#{2,3}\s/.test(line)) heading = line.replace(/^#{2,3}\s+/, '');
        const l = line.toLowerCase();
        if (line.trim() && words.every((w) => l.includes(w))) out.push({ doc: d, heading, line: line.replace(/^[#>\-\s|]+/, '').replace(/\s*\|\s*/g, ' · ').slice(0, 220) });
      }
    }
    return out.slice(0, 40);
  }, [q, docs]);

  if (!isAdmin) return <div className="wrap"><section className="hero-r"><h2 className="headline">Admins only.</h2><p className="subhead">The DevCenter is the handbook for running the website. Ask an admin if you need something from it.</p></section></div>;

  const save = async () => {
    if (!edit) return;
    if (!/^[a-z0-9-]{1,40}$/.test(edit.id)) { toast('Use lower-case letters, numbers and dashes for the short name.'); return; }
    setBusy(true);
    try {
      await api.saveDevDoc({ id: edit.id, title: edit.title.trim(), body: edit.body, sort: edit.sort });
      toast('Saved.'); setEdit(null); setPreview(false); await load(); go('devcenter/' + edit.id);
    } catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  };

  return (
    <div className="wrap devcenter">
      <section className="hero-r reveal" style={{ paddingTop: 60 }}>
        <p className="eyebrow">DevCenter · admins only</p>
        <h2 className="headline">How the website runs.</h2>
        <p className="subhead">The operations handbook: services, schedules, releases, what to do when something breaks, security and the law.</p>
        <input className="helpsearch" type="search" placeholder="Search the handbook, e.g. “secret”, “backup”, “rollback”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the handbook" />
      </section>

      {docs === null && <p className="emptyhint" style={{ textAlign: 'center' }}>Loading…</p>}
      {docs && !docs.length && !edit && (
        <section className="section"><p className="emptyhint">The handbook hasn’t been added yet. <button className="btn" onClick={() => setEdit({ id: 'operations', title: 'Operations', body: '', sort: 1, isNew: true })}>Add the first section</button></p></section>
      )}

      {q && docs && (
        <section className="section">
          <div className="section-head"><h3 className="sec-title">{hits.length ? `${hits.length}${hits.length === 40 ? '+' : ''} matches.` : 'No matches.'}</h3></div>
          <ul className="dev-hits">{hits.map((h, i) => (
            <li key={i}><a href={`#/devcenter/${h.doc.id}`} onClick={() => { setQ(''); setTimeout(() => revealIn(document.getElementById(slug(h.heading)), { behavior: 'auto' }), 50); }}>
              <b>{h.doc.title} › {h.heading}</b><span>{inline(h.line, `h${i}`, true)}</span></a></li>
          ))}</ul>
        </section>
      )}

      {!q && docs && docs.length > 0 && current && !edit && (
        <>
          <nav className="chips devtabs" aria-label="Handbook sections">
            {docs.map((d) => <a key={d.id} className={`chip${d.id === current.id ? ' on' : ''}`} href={`#/devcenter/${d.id}`} aria-current={d.id === current.id ? 'page' : undefined}>{d.title}</a>)}
          </nav>
          <div className="devgrid">
            {headings.length > 1 && (
              <aside className="devtoc" aria-label="On this page"><b>On this page</b>
                {headings.map((h) => <a key={h} href={`#/devcenter/${current.id}`} onClick={(e) => { e.preventDefault(); revealIn(document.getElementById(slug(h))); }}>{h.replace(/[`*\\]/g, '')}</a>)}
              </aside>
            )}
            <article className="section devdoc">
              <div className="section-head"><h3 className="sec-title">{current.title}.</h3>
                <span className="devmeta">Updated {new Date(current.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <button className="btn" onClick={() => setEdit({ ...current })}>Edit</button>
                  <button className="btn" onClick={() => setEdit({ id: '', title: '', body: '', sort: (docs[docs.length - 1]?.sort ?? 0) + 1, isNew: true })}>New section</button></span></div>
              <RichText text={current.body} extended className="devbody" />
            </article>
          </div>
        </>
      )}

      {edit && (
        <section className="section devedit">
          <div className="section-head"><h3 className="sec-title">{edit.isNew ? 'New section.' : `Edit ${edit.title}.`}</h3></div>
          <div className="devfields">
            <label>Title<input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label>Short name (in the address)<input value={edit.id} disabled={!edit.isNew} maxLength={40} onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase() })} placeholder="e.g. operations" /></label>
            <label>Order<input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) || 0 })} /></label>
          </div>
          <p className="emptyhint">Formatting: <code>## Heading</code>, <code>**bold**</code>, <code>- list</code>, <code>- [ ] to do</code>, <code>`code`</code>, and tables with <code>| a | b |</code> rows. Don’t paste passwords or keys here.</p>
          <div className="devtoggle"><button className={`chip${!preview ? ' on' : ''}`} onClick={() => setPreview(false)}>Write</button><button className={`chip${preview ? ' on' : ''}`} onClick={() => setPreview(true)}>Preview</button></div>
          {preview ? <RichText text={edit.body} extended className="devbody" /> : <textarea className="devtext" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={24} spellCheck />}
          <div className="sheet-actions"><button className="btn" onClick={() => { setEdit(null); setPreview(false); }}>Cancel</button><button className="btn primary" disabled={busy || !edit.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
        </section>
      )}
    </div>
  );
}
