import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from './store';

/** Online = a heartbeat in the last 2 minutes (the site sends one about every 45 s while it's open in front of you). */
export const ONLINE_MS = 120_000;
const BEAT_MS = 20_000;   // also how quickly the unread-message count catches up

export type Status = { kind: 'online' } | { kind: 'away'; seen: string } | { kind: 'hidden' } | { kind: 'never' };

interface Presence {
  /** person id → last heartbeat ('' = never active, null = hidden); only people who have joined */
  seen: Map<string, string | null>;
  /** server time of the last heartbeat, to judge "online" without trusting this device's clock */
  serverNow: number;
  unread: number;
  statusOf: (personId: string) => Status;
  onlineIds: string[];
  refresh: () => void;
}

const Ctx = createContext<Presence | null>(null);

export function statusFor(seen: string | null | undefined, serverNow: number, has: boolean): Status {
  if (!has) return { kind: 'never' };
  if (seen === null) return { kind: 'hidden' };
  if (seen === '') return { kind: 'never' };
  if (!seen) return { kind: 'never' };
  return serverNow - Date.parse(seen) < ONLINE_MS ? { kind: 'online' } : { kind: 'away', seen };
}

/** "Online", "Active 5 min ago", "Active yesterday" … */
export function statusLabel(s: Status): string {
  if (s.kind === 'online') return 'Online';
  if (s.kind !== 'away') return s.kind === 'hidden' ? 'Status hidden' : 'Not active yet';
  const mins = Math.round((Date.now() - Date.parse(s.seen)) / 60000);
  if (mins < 60) return `Active ${Math.max(mins, 2)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Active ${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Active yesterday' : days < 30 ? `Active ${days} days ago` : 'Active a while ago';
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { api, snap } = useStore();
  const [seen, setSeen] = useState<Map<string, string | null>>(new Map());
  const [serverNow, setServerNow] = useState(Date.now());
  const [unread, setUnread] = useState(0);
  const offset = useRef(0);
  const enabled = !!snap.me;

  const beat = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api.heartbeat(document.visibilityState === 'visible');
      offset.current = Date.parse(r.now) - Date.now();
      setServerNow(Date.parse(r.now));
      setSeen(new Map(r.people.map((x) => [x.p, x.h ? null : x.seen || ''])));
      setUnread(r.unread);
    } catch { /* offline for a moment; try again next time */ }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) return;
    beat();
    const t = setInterval(() => { if (document.visibilityState === 'visible') beat(); }, BEAT_MS);
    const vis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', vis);
    // a phone notification just arrived (sw.js tells open windows): fetch the new unread count now
    const onSw = (e: MessageEvent) => { if (e.data?.type === 'pushed') beat(); };
    navigator.serviceWorker?.addEventListener('message', onSw);
    // tick the clock so "online" turns into "active 2 min ago" without a new heartbeat
    const tick = setInterval(() => setServerNow(Date.now() + offset.current), 20_000);
    return () => { clearInterval(t); clearInterval(tick); document.removeEventListener('visibilitychange', vis); navigator.serviceWorker?.removeEventListener('message', onSw); };
  }, [beat, enabled]);

  const value = useMemo<Presence>(() => {
    const statusOf = (id: string) => statusFor(seen.get(id), serverNow, seen.has(id));
    const onlineIds = [...seen.keys()].filter((id) => statusOf(id).kind === 'online');
    return { seen, serverNow, unread, statusOf, onlineIds, refresh: beat };
  }, [seen, serverNow, unread, beat]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePresence(): Presence {
  const v = useContext(Ctx);
  if (!v) return { seen: new Map(), serverNow: Date.now(), unread: 0, statusOf: () => ({ kind: 'never' }), onlineIds: [], refresh: () => {} };
  return v;
}

/** The green (online) / grey (away) dot. */
export function StatusDot({ status, size = 10 }: { status: Status; size?: number }) {
  if (status.kind === 'hidden' || status.kind === 'never') return null;
  return <i className={`sdot ${status.kind}`} style={{ width: size, height: size }} aria-label={statusLabel(status)} />;
}
