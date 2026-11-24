import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Api } from './api';
import { buildFamily, type Family } from './family';
import type { Consent, FieldName, ProfileField, Snapshot } from './types';

export interface Store {
  api: Api;
  snap: Snapshot;
  family: Family;
  fieldsOf: (id: string) => Partial<Record<FieldName, ProfileField>>;
  activeConsent: (id: string) => Consent | undefined;
  /** may edit this person's details (themselves, close family / stewards while they haven't joined, admins…) */
  canManage: (id: string) => boolean;
  /** may give or withdraw consent for them (themselves, a parent of a minor, an admin…) */
  canConsent: (id: string) => boolean;
  isMinor: (id: string) => boolean;
  /** the signed-in person is under 18: what they add waits for a parent (0034) */
  amMinor: boolean;
  isAdmin: boolean;
  /** a steward or an admin */
  isSteward: boolean;
  /** may correct this person's tree details: stewards for anyone, members for themselves and close family (0038) */
  canEditTree: (id: string) => boolean;
  myId: string | null;
  photoUrl: (id: string) => string | undefined;
  /** A signed link for any file in the private photos bucket (banner, shared photos). */
  fileUrl: (path?: string | null) => string | undefined;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('store missing'); return s; };

export function StoreProvider({ api, snap, reload, toast, children }: { api: Api; snap: Snapshot; reload: () => Promise<void>; toast: (m: string) => void; children: ReactNode }) {
  const family = useMemo(() => buildFamily(snap.persons, snap.links, snap.partners), [snap.persons, snap.links, snap.partners]);
  const fieldIndex = useMemo(() => {
    const m = new Map<string, Partial<Record<FieldName, ProfileField>>>();
    for (const f of snap.fields) { const o = m.get(f.person_id) || {}; o[f.field] = f; m.set(f.person_id, o); }
    return m;
  }, [snap.fields]);
  const myId = snap.me?.person_id ?? null;
  const isAdmin = snap.me?.role === 'admin';
  const isSteward = isAdmin || snap.me?.role === 'steward';
  const joined = useMemo(() => new Set(snap.joined), [snap.joined]);
  const thisYear = new Date().getFullYear();

  const isMinor = useCallback((id: string) => {
    const p = family.byId.get(id); return !!p && p.is_living && !!p.birth_year && p.birth_year > thisYear - 18;
  }, [family, thisYear]);

  // Mirror the database rules (can_consent / can_manage in 0013), only to decide which buttons to show.
  // The database has the final say.
  const canConsent = useCallback((id: string) => {
    if (isAdmin) return true;
    if (!myId) return false;
    if (id === myId) return !isMinor(id);   // a child never consents for themselves (0034)
    const p = family.byId.get(id); if (!p) return false;
    if (isMinor(id) && (family.parents.get(id) || []).includes(myId)) return true;
    if (!p.is_living && (family.children.get(id) || []).includes(myId)) return true;
    return false;
  }, [isAdmin, myId, family, isMinor]);
  const isClose = useCallback((a: string, b: string) => {
    const house = (x: string) => [x, ...(family.spouses.get(x) || [])];
    const sib = (x: string, y: string) => (family.parents.get(x) || []).some((q) => (family.parents.get(y) || []).includes(q));
    const ha = house(a), hb = house(b);
    return ha.some((x) => hb.some((y) => x === y || (family.parents.get(x) || []).includes(y) || (family.parents.get(y) || []).includes(x) || sib(x, y)));
  }, [family]);
  const canManage = useCallback((id: string) => {
    if (canConsent(id)) return true;
    if (!myId || joined.has(id) || !family.byId.has(id)) return false;
    return isSteward || isClose(myId, id);
  }, [canConsent, myId, joined, family, isSteward, isClose]);

  const canEditTree = useCallback((id: string) => isSteward || (!!myId && !isMinor(myId) && family.byId.has(myId) && isClose(myId, id)), [isSteward, myId, isMinor, family, isClose]);

  const activeConsent = useCallback((id: string) => snap.consents.find((c) => c.person_id === id && !c.withdrawn_at), [snap.consents]);

  // signed photo links, fetched in batches as avatars appear
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());
  const timer = useRef<number | undefined>();
  const requested = useRef(new Set<string>());
  const flush = useCallback(() => {
    const paths = [...pending.current]; pending.current.clear();
    if (!paths.length) return;
    api.photoUrls(paths).then((r) => setUrls((u) => ({ ...u, ...r }))).catch(() => {});
  }, [api]);
  const fileUrl = useCallback((path?: string | null) => {
    if (!path) return undefined;
    if (urls[path]) return urls[path];
    if (!requested.current.has(path)) {
      requested.current.add(path); pending.current.add(path);
      window.clearTimeout(timer.current); timer.current = window.setTimeout(flush, 30);
    }
    return undefined;
  }, [urls, flush]);
  const photoUrl = useCallback((id: string) => fileUrl(fieldIndex.get(id)?.photo?.value), [fieldIndex, fileUrl]);
  // photo links last 10 minutes (security review M3): renew the ones in use every 8 minutes
  const urlsRef = useRef(urls); urlsRef.current = urls;
  useEffect(() => {
    const t = window.setInterval(() => {
      const paths = Object.keys(urlsRef.current);
      if (paths.length) api.photoUrls(paths).then((r) => setUrls((u) => ({ ...u, ...r }))).catch(() => {});
    }, 8 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [api]);
  // send anything queued before an unmount/remount (React's dev double-mount would otherwise drop the first batch)
  useEffect(() => { if (pending.current.size) flush(); return () => window.clearTimeout(timer.current); }, [flush]);

  const value: Store = {
    api, snap, family, isAdmin, isSteward, myId, isMinor, amMinor: !!myId && isMinor(myId), canManage, canConsent, canEditTree, activeConsent, photoUrl, fileUrl, reload, toast,
    fieldsOf: (id) => fieldIndex.get(id) || {},
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
