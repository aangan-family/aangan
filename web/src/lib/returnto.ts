/**
 * Remember the page someone was sent to (a shared conversation link) while they sign in, and take
 * them there afterwards. Sign-in by email opens a new tab, so this lives in localStorage for an hour.
 * Only the page address is kept, never anything about the person.
 */
const KEY = 'fam.next';
const DEEP = /^#\/(talk|photos|p|calendar|tree|whats-new|help|related)(\/[A-Za-z0-9_-]*)*$/;

export function rememberDeepLink(hash = location.hash) {
  if (!DEEP.test(hash)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ h: hash, t: Date.now() })); } catch { /* storage off */ }
}

/** The page to open now, if one was remembered in the last hour (and forget it). */
export function takeDeepLink(): string | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null;
    localStorage.removeItem(KEY);
    const { h, t } = JSON.parse(raw) as { h: string; t: number };
    return typeof h === 'string' && DEEP.test(h) && Date.now() - t < 3600_000 ? h : null;
  } catch { return null; }
}

/** Was the person sent to a conversation? (for a line on the sign-in page) */
export const sentToConversation = (hash = location.hash) => /^#\/talk\/[A-Za-z0-9-]+/.test(hash);
