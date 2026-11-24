import { isEngaged } from '../lib/family';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { describe, type Seg } from '../lib/kinship';
import { tamilTerm } from '../lib/tamil';
import { fullName } from '../lib/format';
import { SearchBox, go } from '../components/common';
import { HelpTip } from '../components/Help';

export function Related({ initialA }: { initialA?: string }) {
  const { family, myId } = useStore();
  const [a, setA] = useState<string | undefined>(initialA || myId || undefined);
  const [b, setB] = useState<string | undefined>(undefined);
  useEffect(() => { if (initialA) { setA(initialA); setB(undefined); } }, [initialA]);
  const rel = a && b ? describe(family, a, b) : null;
  const ta = a && b ? tamilTerm(family, a, b) : null; // what b calls a
  const tb = a && b ? tamilTerm(family, b, a) : null;
  const name = (id?: string) => (id ? fullName(family.byId.get(id)) : '');
  const render = (segs: Seg[]) => segs.map((s, i) => s.t === 'text' ? <span key={i}>{s.s}</span> : s.t === 'rel' ? <b key={i} className="rel">{s.s}</b> : <b key={i}>{name(s.id)}</b>);

  return (
    <div className="wrap">
      <section className="hero-r reveal">
        <p className="eyebrow">Relationship finder</p>
        <h2 className="headline">How are we related?<HelpTip sections={['related']} /></h2>
        <p className="subhead">Pick any two people. See exactly how they’re connected, and the line that joins them.</p>
        <div className="pickers">
          <div><label>First person</label><SearchBox placeholder={a ? name(a) : 'Type a name…'} onPick={setA} /></div>
          <button className="swap" aria-label="Swap" onClick={() => { setA(b); setB(a); }}>⇄</button>
          <div><label>Second person</label><SearchBox placeholder={b ? name(b) : 'Type a name…'} onPick={setB} autoFocus={!!a && !b} /></div>
        </div>
        {(a || b) && <p className="pickednames">{name(a) || '…'} &nbsp;and&nbsp; {name(b) || '…'}</p>}
        {rel && (
          <>
            <div className="answer">{render(rel.sentence)}{rel.reverse && <span className="rev">{render(rel.reverse)}</span>}</div>
            {(ta || tb) && (
              <p className="tamilpair">
                {ta && <span>{name(b)} calls {name(a)} <b>{ta}</b>.</span>}
                {tb && <span>{name(a)} calls {name(b)} <b>{tb}</b>.</span>}
              </p>
            )}
            {rel.chain && (
              <div className="path">
                {rel.marriedStart && <><button className="chip" onClick={() => go('p/' + a)}>{name(a)}</button><span className="arr">{rel.chain?.[0] && isEngaged(family, a!, rel.chain[0]) ? 'engaged to' : 'married to'}</span></>}
                {rel.chain.map((id, i) => (
                  <span key={id} style={{ display: 'contents' }}>
                    {i > 0 && <span className="arr">→</span>}
                    <button className={`chip${rel.tops?.includes(id) ? ' top' : ''}`} onClick={() => go('p/' + id)}>{name(id)}</button>
                  </span>
                ))}
                {rel.marriedEnd && <><span className="arr">{rel.chain?.length && isEngaged(family, rel.chain[rel.chain.length - 1], b!) ? 'engaged to' : 'married to'}</span><button className="chip" onClick={() => go('p/' + b)}>{name(b)}</button></>}
              </div>
            )}
            {rel.tops && rel.chain && rel.chain.length > 2 && (
              <p className="pathnote">Closest common {rel.tops.length > 1 ? 'ancestors' : 'ancestor'}: {rel.tops.map((t) => family.byId.get(t)!.given_name).join(' & ')}.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
