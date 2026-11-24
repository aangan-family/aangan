import { useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { inviteLink, inviteMessage, legacyInviteLink } from '../lib/invite';
import { firstName } from '../lib/format';

/** Ways to get an invitation to someone: WhatsApp, copy, or a fresh sign-in email from the site. */
export function InviteShare({ email, personId, code, pending }: { email: string; personId: string | null;
  /** the invitation's random code (0024); the link carries it instead of the email */
  code?: string | null;
  /** a member's invitation still waiting for a steward or admin: nothing to share yet */
  pending?: boolean }) {
  const { api, family, toast } = useStore();
  const [mail, setMail] = useState<'idle' | 'sending' | 'sent'>('idle');
  const p = personId ? family.byId.get(personId) : null;
  const first = p ? firstName(p) : '';
  if (pending) return (
    <div className="invshare">
      <p className="inv-wait"><b>Waiting for approval.</b> A steward or admin checks that {email} really is {first || 'their'}{first ? '’s' : ''} email before the invitation works. They’ve been emailed; it usually takes less than a day.</p>
      <p className="note">Once it’s approved, open <b>Invitations you’ve sent</b> on the Home page and choose <b>Share again</b> to send {first || 'them'} the link.</p>
    </div>
  );
  const msg = inviteMessage(first, email, code);
  const link = code ? inviteLink(code) : legacyInviteLink(email);
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => toast(`${what} copied.`)).catch(() => toast('Couldn’t copy. Press and hold the text to copy it.'));
  async function sendMail() {
    setMail('sending');
    try { await api.signInWithEmail(email); setMail('sent'); toast(`Sign-in email sent to ${email}.`); }
    catch (e) { setMail('idle'); toast(friendly(e)); }
  }
  return (
    <div className="invshare">
      <div className="invmsg">{msg}</div>
      <div className="invlink"><code>{link}</code><button className="tlink small nochev" onClick={() => copy(link, 'Link')}>Copy link</button></div>
      <div className="ctas" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <a className="pill small" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
        <button className="pill small ghost" onClick={() => copy(msg, 'Message')}>Copy message</button>
        <button className="pill small ghost" disabled={mail !== 'idle'} onClick={sendMail}>{mail === 'sending' ? 'Sending…' : mail === 'sent' ? 'Sign-in email sent ✓' : 'Email a sign-in link now'}</button>
      </div>
      <p className="note">The link doesn’t show their email address, only a hint. To get in they still need that email’s sign-in link or its Google account, so it’s safe if it’s forwarded.</p>
    </div>
  );
}
