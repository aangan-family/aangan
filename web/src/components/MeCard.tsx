import { SiteAdminCard, useIsSiteAdmin } from './SiteAdmin';
import { useStore } from '../lib/store';
import { lineageOf, isEngaged } from '../lib/family';
import { firstName, fullName } from '../lib/format';
import { Avatar, go } from './common';

/** "You": your photo, your place in the family, and the two things you came for. */
export function MeCard({ compact }: { compact?: boolean }) {
  const { family, myId, activeConsent, fieldsOf } = useStore();
  const site = useIsSiteAdmin();
  if (site) return <SiteAdminCard compact={compact} />;
  if (!myId || !family.byId.has(myId)) return null;
  const p = family.byId.get(myId)!;
  const gen = family.gen.get(myId);
  const host = family.blood.has(myId) ? myId : (family.spouses.get(myId) || []).find((s) => family.blood.has(s));
  const line = host ? lineageOf(family, host) : [];
  const needs = p.is_living && !activeConsent(myId);
  const filled = Object.keys(fieldsOf(myId)).length;
  return (
    <section className={`mecard${compact ? ' compact' : ''}`} aria-label="You">
      <button className="me-who" onClick={() => go('p/' + myId)}>
        <Avatar id={myId} size={compact ? 56 : 72} />
        <span>
          <small>You</small>
          <b>{fullName(p)}</b>
          <span>{[gen ? `Generation ${gen}` : '', host && host !== myId ? `${isEngaged(family, myId!, host) ? 'engaged to' : 'married to'} ${firstName(family.byId.get(host))}` : ''].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
      {!compact && line.length > 1 && (
        <div className="me-line" aria-label="Your line">{line.map((x, i) => (
          <span key={x}>{i > 0 && <i>›</i>}<button onClick={() => go('p/' + x)} className={x === host ? 'cur' : ''}>{firstName(family.byId.get(x))}</button></span>
        ))}</div>
      )}
      {!compact && (
        <div className="me-actions">
          <button className="pill small" onClick={() => go('p/' + myId)}>{needs ? 'Set up your profile' : filled ? 'My profile' : 'Add your details'}</button>
          <button className="pill small ghost" onClick={() => go('tree')}>Find me in the tree</button>
        </div>
      )}
    </section>
  );
}
