/**
 * YouTube links in Talk posts play right on the page.
 * Finds YouTube links (bare or as [text](url)) and returns the video id and start time.
 */
export interface VideoRef { id: string; start: number }

const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;

/** Seconds from "90", "90s", "1m30s", "1h2m3s". */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
}

export function youtubeRef(href: string): VideoRef | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  let id: string | null = null;
  if (/^(?:www\.)?youtu\.be$/i.test(u.hostname)) id = u.pathname.slice(1).split('/')[0];
  else if (HOSTS.test(u.hostname)) {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); if (m) id = m[1]; }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return { id, start: seconds(u.searchParams.get('t') || u.searchParams.get('start')) };
}

/** YouTube videos mentioned in a post, in order, without repeats (at most `max`). */
export function videosIn(text: string, max = 3): VideoRef[] {
  const out: VideoRef[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)<>\]"']+/g)) {
    const v = youtubeRef(m[0].replace(/[.,;:!?]+$/, ''));
    if (v && !out.some((o) => o.id === v.id)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
