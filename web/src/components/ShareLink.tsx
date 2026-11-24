import { useState } from 'react';
import { SITE_URL } from '../lib/site';
import { useStore } from '../lib/store';
import { Sheet } from './common';

const SITE = SITE_URL;

/**
 * Share a page of the site (a Talk conversation) outside it: copy the link, WhatsApp, or the phone's
 * share sheet. Only the link and the words the person chooses leave the site; whoever opens it still
 * has to sign in as a family member, and anyone else is asked to request to join.
 */
export function ShareLink({ hash, title, what = 'conversation' }: { hash: string; title: string; what?: string }) {
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const url = `${SITE}/${hash}`;
  const [text, setText] = useState(() => `${title}\n\nHave a look at this ${what} on our family website and join in 🙏\n${url}\n\n(Sign in with the email you were invited with. Not on the site yet? Open the link and ask to join.)`);
  const withLink = text.includes(url) ? text : `${text.trim()}\n${url}`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  async function copy(s: string, done: string) {
    try { await navigator.clipboard.writeText(s); toast(done); }
    catch { toast('Couldn’t copy. Press and hold the link to copy it.'); }
  }
  async function shareSheet() {
    try { await navigator.share({ title, text: withLink }); setOpen(false); } catch { /* cancelled */ }
  }

  return (
    <>
      <button type="button" className="tlink small nochev share-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>
        Share
      </button>
      {open && (
        <Sheet title={`Share this ${what}`} sub="Only family members who have joined can open it. Anyone else is asked to sign in or request to join." onClose={() => setOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setOpen(false)}>Done</button>
            {canShare && <button className="btn" onClick={shareSheet}>More…</button>}
            <a className="btn primary" href={`https://wa.me/?text=${encodeURIComponent(withLink)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
          </>}>
          <div className="sharelink">
            <span className="sharelink-url" aria-label="Link">{url}</span>
            <button className="btn" onClick={() => copy(url, 'Link copied.')}>Copy link</button>
          </div>
          <label htmlFor="share-text" className="sharelabel">Message</label>
          <textarea id="share-text" className="am-text" rows={6} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
          <p className="note small">You can change the message before sending. <button type="button" className="tlink small nochev" onClick={() => copy(withLink, 'Message copied.')}>Copy message</button></p>
        </Sheet>
      )}
    </>
  );
}
