import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { byWhom, describe, verbOf } from '../lib/changelog';
import { ago, firstName } from '../lib/format';
import { ROLE_LABEL, type LogEntry } from '../lib/types';
import { go } from './common';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Show logs" at the bottom of every profile: who changed what, and when. Any member can open it. */
export function ProfileLog({ id }: { id: string }) {
  const { api, family, snap } = useStore();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LogEntry[] | null>(null);
  const [err, setErr] = useState('');
  const [limit, setLimit] = useState(20);
  const p = family.byId.get(id);

  useEffect(() => { setOpen(false); setRows(null); setLimit(20); }, [id]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setErr('');
    api.profileLog(id).then((r) => { if (live) setRows(r); }).catch((e) => { if (live) setErr(friendly(e)); });
    return () => { live = false; };
  }, [open, id, api, snap]);

  return (
    <section className="section plog">
      <button className="tlink plog-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide logs' : 'Show logs'}</button>
      {open && (
        <div className="plog-body">
          <p className="plog-sub">Every change to {p ? `${firstName(p)}’s` : 'this'} page: who made it, what changed and when. Details you can’t see stay hidden here too.</p>
          {err && <p className="emptyhint">{err}</p>}
          {!err && !rows && <p className="emptyhint">Loading…</p>}
          {rows && !rows.length && <p className="emptyhint">No changes recorded yet.</p>}
          {rows && rows.length > 0 && (
            <ol className="plog-list">
              {rows.slice(0, limit).map((e, i) => {
                const v = verbOf(e);
                return (
                  <li key={i}>
                    <span className={`plog-verb ${v.toLowerCase()}`}>{v}</span>
                    <div>
                      <div className="plog-what">{describe(e, family)}</div>
                      <div className="plog-meta">
                        by {e.by_person && family.byId.has(e.by_person)
                          ? <button className="tlink" onClick={() => go('p/' + e.by_person)}>{byWhom(e, family)}</button>
                          : byWhom(e, family)}
                        {e.by_role && e.by_role !== 'member' && <em className="vischip">{ROLE_LABEL[e.by_role]}</em>}
                        {' · '}<time dateTime={e.at} title={ago(e.at)}>{when(e.at)}</time>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {rows && rows.length > limit && <button className="pill ghost small" onClick={() => setLimit(limit + 30)}>Show older changes</button>}
        </div>
      )}
    </section>
  );
}
