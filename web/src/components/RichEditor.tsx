import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PhotoPicker } from './PhotoPicker';
import { photoBlock } from './PostPhoto';
import { useStore } from '../lib/store';
import { MentionMenu, mentionMatches, mentionQuery, mentionToken } from './MentionMenu';
import type { Person } from '../lib/types';
import { RichText, applyFormat, photoToken, photosIn, PHOTO_LINE } from '../lib/richtext';
import { videosIn } from '../lib/video';
import { Videos } from './VideoEmbed';
import { HelpMeWrite, SpeakButton, SparkleIcon, insertSpoken } from './WritingHelp';

type Fmt = Parameters<typeof applyFormat>[3];
const ALL: { k: Fmt; label: string; title: string; key?: string }[] = [
  { k: 'bold', label: 'B', title: 'Bold (Ctrl+B)', key: 'b' },
  { k: 'italic', label: 'I', title: 'Italic (Ctrl+I)', key: 'i' },
  { k: 'strike', label: 'S', title: 'Strikethrough' },
  { k: 'h2', label: 'H1', title: 'Heading' },
  { k: 'h3', label: 'H2', title: 'Subheading' },
  { k: 'ul', label: '•', title: 'Bullet list' },
  { k: 'ol', label: '1.', title: 'Numbered list' },
  { k: 'quote', label: '❝', title: 'Quote' },
  { k: 'link', label: 'Link', title: 'Link (Ctrl+K)', key: 'k' },
];
const SMALL: Fmt[] = ['bold', 'italic', 'ul', 'ol', 'link'];
/** Emoji for family talk: smiles, blessings, festivals, food. */
export const PALETTE = ['🙏', '😊', '😂', '❤️', '👍', '👏', '🎉', '🪔', '🌸', '🌼', '🛕', '🕉️', '🔱', '🐍', '🥥', '🍌', '🍛', '🍚', '🥘', '☕', '🍬', '🎂', '👶', '💍', '📿', '🌙', '☀️', '📅', '📸', '✨'];

/**
 * Text box with a formatting toolbar, emoji and a preview. Text is stored with simple
 * markers (**bold**, *italic*, - lists) and shown with <RichText>, never as raw HTML.
 */
export function RichEditor({ value, onChange, maxLength, rows = 8, placeholder, compact, label, autoFocus, onSubmit, mentions, photos }: {
  value: string; onChange: (v: string) => void; maxLength: number; rows?: number; placeholder?: string;
  compact?: boolean; label: string; autoFocus?: boolean; onSubmit?: () => void;
  /** offer @-mentions of family members while typing */
  mentions?: boolean;
  /** offer adding photos (Talk): ![caption](photo:id) lines */
  photos?: boolean;
}) {
  const { snap, myId, amMinor } = useStore();
  const joined = useMemo(() => new Set(snap.joined), [snap.joined]);
  const [mq, setMq] = useState<{ at: number; query: string } | null>(null);
  const [mAct, setMAct] = useState(0);
  const mItems = useMemo(() => (mentions && mq ? mentionMatches(snap.persons, joined, mq.query, myId) : []), [mentions, mq, snap.persons, joined, myId]);
  const track = (v: string, caret: number) => { if (!mentions) return; const q = mentionQuery(v, caret); setMq(q); if (!q || q.query !== mq?.query) setMAct(0); };
  function pickMention(p: Person) {
    if (!mq || !ta.current) return;
    const caret = ta.current.selectionStart ?? value.length;
    const tok = mentionToken(p);
    const v = value.slice(0, mq.at) + tok + value.slice(caret);
    setMq(null);
    put(v, mq.at + tok.length, mq.at + tok.length);
  }
  function startMention() {
    const [a, b] = ta.current ? sel() : [value.length, value.length];
    const pre = a > 0 && !/\s/.test(value[a - 1]) ? ' @' : '@';
    const v = value.slice(0, a) + pre + value.slice(b);
    put(v, a + pre.length, a + pre.length);
    setMq({ at: a + pre.length - 1, query: '' }); setMAct(0);
  }
  const [preview, setPreview] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [help, setHelp] = useState(false);
  const [picking, setPicking] = useState(false);
  const caretAt = useRef<number | null>(null);
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const tools = compact ? ALL.filter((t) => SMALL.includes(t.k)) : ALL;
  const sel = () => { const el = ta.current!; return [el.selectionStart ?? value.length, el.selectionEnd ?? value.length]; };
  const put = (v: string, start: number, end: number) => {
    onChange(v.slice(0, maxLength));
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(start, end); } });
  };
  function fmt(k: Fmt) {
    if (!ta.current) return;
    let url: string | undefined;
    if (k === 'link') {
      const u = window.prompt('Link address (starting with https://)', 'https://');
      if (!u) return;
      if (!/^https?:\/\/\S+$/.test(u.trim())) { setErr('Links must start with https://'); return; }
      url = u.trim();
    }
    setErr('');
    const [a, b] = sel();
    const r = applyFormat(value, a, b, k, url);
    put(r.value, r.start, r.end);
  }
  function addEmoji(e: string) {
    const [a, b] = ta.current ? sel() : [value.length, value.length];
    put(value.slice(0, a) + e + value.slice(b), a + e.length, a + e.length);
    setEmoji(false);
  }
  function openPhotos() { caretAt.current = ta.current ? sel()[1] : value.length; setPicking(true); setEmoji(false); }
  /** Puts the photo on a line of its own where the cursor was. */
  function addPhoto(id: string, caption: string) {
    const at = Math.min(caretAt.current ?? value.length, value.length);
    const before = value.slice(0, at), after = value.slice(at);
    const tok = (before && !before.endsWith('\n') ? '\n' : '') + photoToken(id, caption) + '\n' + (after.startsWith('\n') || !after ? '' : '\n');
    if ((before + tok + after).length > maxLength) { setErr('The post is too long to add a photo. Shorten it a little first.'); return; }
    setErr('');
    put(before + tok + after, at + tok.length, at + tok.length);
  }
  function removePhoto(id: string) {
    const v = value.split('\n').filter((l) => l.match(PHOTO_LINE)?.[2].toLowerCase() !== id).join('\n').replace(/\n{3,}/g, '\n\n');
    put(v, v.length, v.length);
  }
  const attached = photos ? photosIn(value) : [];
  function addSpoken(t: string) {
    const at = ta.current ? sel()[1] : value.length;
    const r = insertSpoken(value, t, at);
    put(r.value, r.caret, r.caret);
  }
  return (
    <div className={`rteditor${compact ? ' compact' : ''}`}>
      <div className="rtbar" role="toolbar" aria-label="Formatting">
        {tools.map((t) => (
          <button key={t.k} type="button" className={`rtbtn rt-${t.k}`} title={t.title} aria-label={t.title} disabled={preview}
            onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(t.k)}>{t.label}</button>
        ))}
        {mentions && <button type="button" className="rtbtn rt-at" title="Mention someone (type @)" aria-label="Mention someone" disabled={preview}
          onMouseDown={(e) => e.preventDefault()} onClick={startMention}>@</button>}
        {photos && !amMinor && <button type="button" className="rtbtn rt-photo" title="Add a photo" aria-label="Add a photo" disabled={preview}
          onMouseDown={(e) => e.preventDefault()} onClick={openPhotos}>📷</button>}
        <button type="button" className={`rtbtn rt-emoji${emoji ? ' on' : ''}`} title="Emoji" aria-label="Emoji" aria-expanded={emoji} disabled={preview}
          onMouseDown={(e) => e.preventDefault()} onClick={() => setEmoji(!emoji)}>😊</button>
        <span className="rtsep" />
        <div className="seg rtseg" role="group" aria-label="View">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button>
          <button type="button" aria-pressed={preview} onClick={() => { setPreview(true); setEmoji(false); setHelp(false); }}>Preview</button>
        </div>
      </div>
      {emoji && <div className="emojipad" role="listbox" aria-label="Choose an emoji">{PALETTE.map((e) => (
        <button key={e} type="button" role="option" aria-selected="false" onMouseDown={(ev) => ev.preventDefault()} onClick={() => addEmoji(e)}>{e}</button>
      ))}</div>}
      {preview ? (
        <div className="rtpreview" style={{ minHeight: rows * 24 }}>{value.trim() ? <><RichText text={value} className="story" photo={photos ? photoBlock : undefined} /><Videos videos={videosIn(value)} /></> : <p className="emptyhint">Nothing to preview yet.</p>}</div>
      ) : (
        <div className="rtwrap">
        <textarea ref={ta} className="rtarea" rows={rows} maxLength={maxLength} value={value}
          onChange={(e) => { onChange(e.target.value); track(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onClick={(e) => track(value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onBlur={() => setTimeout(() => setMq(null), 150)}
          placeholder={placeholder} aria-label={label} autoFocus={autoFocus} style={{ minHeight: rows * 24 }}
          onKeyDown={(e) => {
            if (mq && mentions) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (mItems.length) { e.preventDefault(); setMAct((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + mItems.length) % mItems.length); } return; }
              if ((e.key === 'Enter' || e.key === 'Tab') && mItems.length) { e.preventDefault(); pickMention(mItems[mAct] || mItems[0]); return; }
              if (e.key === 'Escape') { e.preventDefault(); setMq(null); return; }
            }
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); return; }
            const t = ALL.find((x) => x.key === e.key.toLowerCase());
            if (t) { e.preventDefault(); fmt(t.k); }
          }} />
        {mentions && mq && <MentionMenu items={mItems} active={mAct} onPick={pickMention} joined={joined} />}
        </div>
      )}
      {!preview && attached.length > 0 && <AttachedPhotos ids={attached} onRemove={removePhoto} />}
      {!preview && !amMinor && (
        <div className="assist">
          <button type="button" className={`assist-btn${help ? ' on' : ''}`} aria-expanded={help} onClick={() => { setHelp(!help); setEmoji(false); }}>
            <SparkleIcon /><span>Help me write</span>
          </button>
          <SpeakButton className="assist-btn" label onText={addSpoken} />
          <span className="assist-hint">Speak in any language, or let AI polish your words.</span>
        </div>
      )}
      {picking && createPortal(<PhotoPicker onPick={addPhoto} onClose={() => setPicking(false)} />, document.body)}
      {help && !preview && <HelpMeWrite text={value} onUse={(v) => put(v, v.length, v.length)} onClose={() => setHelp(false)} />}
      {(err || value.length > maxLength * 0.8) && <div className={`note${err ? ' errtext' : ''}`}>{err || `${value.length} / ${maxLength}`}</div>}
    </div>
  );
}

/** Thumbnails of the photos in a post being written, each removable. */
function AttachedPhotos({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  const { snap, fileUrl } = useStore();
  return (
    <div className="attached" aria-label="Photos in this post">
      {ids.map((id) => {
        const ph = snap.photos.find((p) => p.id.toLowerCase() === id);
        const url = ph ? fileUrl(ph.path) : undefined;
        return (
          <span key={id} className="att">
            {url ? <img src={url} alt={ph?.caption || 'Photo'} /> : <span className="pph" />}
            <button type="button" className="x" aria-label={`Remove ${ph?.caption || 'photo'} from the post`} onClick={() => onRemove(id)}>✕</button>
          </span>
        );
      })}
      <span className="att-note">Each photo appears where its photo line is in the text. Press Preview to see it.</span>
    </div>
  );
}
