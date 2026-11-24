import { useEffect, useRef, useState } from 'react';
import { DOMAIN } from '../lib/site';
import { useStore } from '../lib/store';
import { friendly, type WriteStyle } from '../lib/api';
import { MAX_SECONDS, toWav } from '../lib/wav';

/**
 * Writing help in the text boxes (Talk, replies, Messages):
 *  - "Help me write" ✨ rewrites what you wrote in a style; you choose Use this or Keep mine.
 *  - "Speak" 🎤 (press and hold on a phone, or tap to start and stop) turns what you say, in any
 *    language, into English text in the box. Nothing is ever sent without you pressing Send.
 * Runs on Cloudflare Workers AI through our API address; nothing written or said is saved.
 */

export const STYLES: { k: WriteStyle; label: string; hint: string }[] = [
  { k: 'grammar', label: 'Fix grammar', hint: 'Spelling and grammar only' },
  { k: 'clearer', label: 'Make it clearer', hint: 'Easier to read' },
  { k: 'shorter', label: 'Shorter', hint: 'Keep the main points' },
  { k: 'warmer', label: 'Warmer', hint: 'More affectionate' },
];

export const SparkleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </svg>
);
export const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" />
  </svg>
);

/** Panel under the toolbar: pick a style, see the suggestion, then Use this / Keep mine. */
export function HelpMeWrite({ text, onUse, onClose }: { text: string; onUse: (v: string) => void; onClose: () => void }) {
  const { api } = useStore();
  const [busy, setBusy] = useState<WriteStyle | null>(null);
  const [out, setOut] = useState<{ style: WriteStyle; text: string } | null>(null);
  const [err, setErr] = useState('');
  const empty = !text.trim();
  async function run(style: WriteStyle) {
    setBusy(style); setErr('');
    try { setOut({ style, text: await api.writeHelp(text, style) }); } catch (e) { setErr(friendly(e)); } finally { setBusy(null); }
  }
  return (
    <div className="wh" role="dialog" aria-label="Help me write">
      <div className="wh-head">
        <span className="wh-title"><SparkleIcon /> Help me write</span>
        <button type="button" className="wh-x" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {empty ? <p className="wh-note">Write something first, even roughly. Then choose how you’d like it polished.</p> : !out ? (
        <div className="wh-styles">
          {STYLES.map((s) => (
            <button key={s.k} type="button" className="wh-style" disabled={!!busy} onClick={() => run(s.k)}>
              <b>{s.label}</b><span>{busy === s.k ? 'Writing…' : s.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="wh-out" aria-live="polite">{out.text}</div>
          <div className="wh-acts">
            <button type="button" className="pill small" onClick={() => { onUse(out.text); onClose(); }}>Use this</button>
            <button type="button" className="pill small ghost" onClick={onClose}>Keep mine</button>
            <button type="button" className="tlink small nochev" disabled={!!busy} onClick={() => run(out.style)}>{busy ? 'Writing…' : 'Try again'}</button>
            <button type="button" className="tlink small nochev" onClick={() => setOut(null)}>Other styles</button>
          </div>
        </>
      )}
      {err && <p className="wh-note errtext">{err}</p>}
      <p className="wh-fine">Only you see this until you send it. Nothing is saved.</p>
    </div>
  );
}

type Phase = 'idle' | 'starting' | 'holding' | 'tapped' | 'working' | 'done' | 'error';
const HOLD_MS = 450;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/**
 * The microphone button. Press and hold, speak, let go. A quick tap instead starts recording
 * until you tap ■ Stop (easier on a computer). ✕ throws the recording away.
 */
export const touchFirst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

export function SpeakButton({ onText, className = '', disabled, label }: { onText: (text: string) => void; className?: string; disabled?: boolean;
  /** show words beside the microphone ("Hold to speak" on phones, "Speak" on computers) */
  label?: boolean }) {
  const { api } = useStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const downAt = useRef(0);
  const released = useRef(false);
  const cancelled = useRef(false);
  const timer = useRef<number>();

  const cleanup = () => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null; rec.current = null;
  };
  useEffect(() => () => { cancelled.current = true; try { rec.current?.stop(); } catch { /* already stopped */ } cleanup(); }, []);
  useEffect(() => {
    if (phase !== 'done' && phase !== 'error') return;
    const t = window.setTimeout(() => setPhase('idle'), phase === 'done' ? 3500 : 6000);
    return () => window.clearTimeout(t);
  }, [phase]);

  async function start() {
    if (!canRecord()) { setMsg('Your browser can’t record. Try Chrome or Safari.'); setPhase('error'); return; }
    cancelled.current = false; released.current = false; chunks.current = [];
    setPhase('starting'); setSecs(0);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      setMsg(`Please allow the microphone for ${DOMAIN} (tap the lock or ⓘ beside the address), then try again.`);
      setPhase('error'); return;
    }
    const r = new MediaRecorder(stream.current);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => finish(r.mimeType);
    r.start();
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSecs(s);
      if (s >= MAX_SECONDS) stop();
    }, 200);
    // let go before the microphone was ready: treat it as a tap
    setPhase(released.current ? 'tapped' : 'holding');
  }

  function stop() { window.clearInterval(timer.current); if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); }
  function cancel() { cancelled.current = true; stop(); cleanup(); setPhase('idle'); }

  async function finish(type: string) {
    const blob = new Blob(chunks.current, { type: type || 'audio/webm' });
    cleanup();
    if (cancelled.current) return;
    setPhase('working');
    try {
      if (blob.size < 2000) throw new Error('I didn’t hear anything. Hold the microphone and speak.');
      const wav = await toWav(blob).catch(() => { throw new Error('Couldn’t read that recording. Please try again.'); });
      const r = await api.speakToText(wav);
      onText(r.text);
      setMsg(r.language && r.language !== 'English' ? `Heard ${r.language}, written in English. Check it, then send.` : 'Check it, then send.');
      setPhase('done');
    } catch (e) { setMsg(friendly(e)); setPhase('error'); }
  }

  const live = phase === 'holding' || phase === 'tapped' || phase === 'starting';
  return (
    <>
      <button type="button" className={`speakbtn${live ? ' rec' : ''} ${className}`} disabled={disabled || phase === 'working'}
        aria-label={live ? 'Stop recording' : 'Speak (press and hold)'} title="Speak: press and hold, or tap to start and stop"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (phase === 'tapped') { stop(); return; }
          if (phase !== 'idle' && phase !== 'done' && phase !== 'error') return;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          downAt.current = Date.now();
          start();
        }}
        onPointerUp={() => {
          released.current = true;
          if (phase === 'holding' || (phase === 'starting' && Date.now() - downAt.current >= HOLD_MS)) {
            if (Date.now() - downAt.current < HOLD_MS) setPhase('tapped'); else stop();
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (phase === 'tapped' || phase === 'holding') stop(); else if (!live) { released.current = true; start(); } } }}>
        {live ? <span className="speak-dot" /> : <MicIcon />}
        {label && <span>{live ? 'Listening…' : phase === 'working' ? 'Writing…' : touchFirst() ? 'Hold to speak' : 'Speak'}</span>}
      </button>
      {phase !== 'idle' && (
        <div className={`speakbar ${phase}`} role="status" aria-live="polite">
          {live && <><span className="speak-dot" /><b>{phase === 'starting' ? 'Getting the microphone…' : mmss(secs)}</b>
            <span>{phase === 'holding' ? 'Speak in any language. Let go to finish.' : phase === 'tapped' ? 'Listening… speak in any language.' : ''}</span>
            {phase === 'tapped' && <button type="button" className="pill small" onClick={stop}>■ Stop</button>}
            <button type="button" className="speak-x" aria-label="Cancel recording" onPointerDown={(e) => e.stopPropagation()} onClick={cancel}>×</button></>}
          {phase === 'working' && <><span className="spin" /><span>Writing it down…</span></>}
          {(phase === 'done' || phase === 'error') && <><span className={phase === 'error' ? 'errtext' : ''}>{msg}</span>
            <button type="button" className="speak-x" aria-label="Dismiss" onClick={() => setPhase('idle')}>×</button></>}
        </div>
      )}
    </>
  );
}

/** Put spoken text into a box at the cursor, with a space if needed. */
export function insertSpoken(value: string, add: string, at = value.length): { value: string; caret: number } {
  const before = value.slice(0, at), after = value.slice(at);
  const pre = before && !/\s$/.test(before) ? ' ' : '';
  const post = after && !/^\s/.test(after) ? ' ' : '';
  const v = before + pre + add.trim() + post + after;
  return { value: v, caret: (before + pre + add.trim()).length };
}
