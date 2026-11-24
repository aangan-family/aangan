import { useStore } from '../lib/store';
import { Lamp } from './Heritage';
import { go } from './common';

/** The site's own admin login (an admin with no place in the tree), addressed as 'site' in Messages. */
export const SITE = 'site';
export const SITE_NAME = 'Family Admin';

export function SiteAvatar({ size }: { size: number }) {
  return <span className="av site-av" style={{ width: size, height: size }} aria-hidden="true"><Lamp size={Math.round(size * 0.42)} /></span>;
}

/** true when the signed-in login is an admin account that isn't anyone in the tree */
export function useIsSiteAdmin() {
  const { snap, myId, family } = useStore();
  return snap.me?.role === 'admin' && !(myId && family.byId.has(myId));
}

/** "You" card for the Family Admin account: who you are here, and where your work is */
export function SiteAdminCard({ compact }: { compact?: boolean }) {
  return (
    <section className={`mecard site-card${compact ? ' compact' : ''}`} aria-label="You">
      <div className="me-who">
        <SiteAvatar size={compact ? 56 : 72} />
        <span>
          <small>You</small>
          <b>{SITE_NAME}</b>
          <span>The website admin account. Not a person in the tree.</span>
        </span>
      </div>
      {!compact && (
        <div className="me-actions">
          <button className="pill small" onClick={() => go('admin')}>Admin</button>
          <button className="pill small ghost" onClick={() => go('chat')}>Messages</button>
        </div>
      )}
    </section>
  );
}
