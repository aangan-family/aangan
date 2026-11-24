import { useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';

/** Send the invitation email (a sign-in link) to this address again. */
export function ResendButton({ email, className = 'btn', label = 'Resend email' }: { email: string; className?: string; label?: string }) {
  const { api, toast } = useStore();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  async function send() {
    setState('sending');
    try { await api.signInWithEmail(email); setState('sent'); toast(`Invitation email sent again to ${email}.`); }
    catch (e) { setState('idle'); toast(friendly(e)); }
  }
  return (
    <button className={className} disabled={state !== 'idle'} onClick={send} title={`Email ${email} a fresh sign-in link`}>
      {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent ✓' : label}
    </button>
  );
}
