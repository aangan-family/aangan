import { useEffect, useRef, useState } from 'react';

/** A family-friendly emoji set, by category. Recent picks are remembered on this device. */
export const EMOJI_GROUPS: { key: string; icon: string; label: string; list: string[] }[] = [
  { key: 'smile', icon: '😊', label: 'Smileys', list: ['😊', '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '🙂', '😉', '😍', '🥰', '😘', '😇', '🤗', '🤩', '😎', '🤔', '🤭', '😌', '😴', '😋', '😜', '🤪', '😮', '😲', '🥺', '😢', '😭', '😅', '😬', '🙄', '😤', '😡', '🤒', '🤧', '🥳', '😶', '🫡', '🫶'] },
  { key: 'hands', icon: '🙏', label: 'Hands and people', list: ['🙏', '👍', '👎', '👏', '🙌', '👋', '🤝', '✌️', '🤞', '👌', '🤙', '💪', '☝️', '👆', '👇', '👉', '👈', '✋', '🫰', '🤲', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '👪', '👨‍👩‍👧‍👦', '👫', '💑', '🤰', '🧘', '🚶', '🏃', '💃', '🕺'] },
  { key: 'love', icon: '❤️', label: 'Hearts', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💕', '💞', '💓', '💗', '💖', '💝', '💘', '❣️', '💔', '❤️‍🔥', '💐', '🌹', '💋', '😻', '🥹'] },
  { key: 'festive', icon: '🪔', label: 'Festivals and prayer', list: ['🪔', '🛕', '🕉️', '🔱', '📿', '🐚', '🌺', '🌸', '🌼', '🏵️', '🥥', '🍌', '🍃', '🐍', '🐘', '🐄', '🦚', '🎉', '🎊', '🎂', '🎁', '🎈', '🎆', '🎇', '✨', '🌙', '☀️', '⭐', '💍', '👰', '🤵', '🎓', '🏆', '🥇', '🎶', '🥁'] },
  { key: 'food', icon: '🍛', label: 'Food', list: ['🍛', '🍚', '🥘', '🍲', '🥗', '🫓', '🥞', '🍙', '🍘', '🥟', '🍜', '🌶️', '🧄', '🧅', '🥔', '🍅', '🥭', '🍌', '🍉', '🍇', '🍎', '🍊', '🍋', '🍍', '🥛', '🍯', '🧈', '🍬', '🍭', '🍮', '🍨', '🍪', '☕', '🍵', '🧃', '🥤'] },
  { key: 'nature', icon: '🌿', label: 'Nature and travel', list: ['🌿', '🌳', '🌴', '🌾', '🍀', '🌻', '🌷', '🌧️', '⛈️', '🌈', '🌊', '🏖️', '⛰️', '🏡', '🏠', '🏫', '🏥', '✈️', '🚆', '🚗', '🛺', '🚌', '🚲', '🧳', '🗺️', '📍', '🐶', '🐱', '🐦', '🦋'] },
  { key: 'things', icon: '📸', label: 'Things', list: ['📸', '📷', '📱', '💻', '📞', '✉️', '📅', '⏰', '📚', '✏️', '📝', '📌', '🔑', '💡', '🎵', '🎬', '📺', '⚽', '🏏', '♟️', '🧩', '🎨', '🧵', '🪴', '💊', '🩺', '💰', '🛒', '🎯', '✅', '❌', '❓', '‼️', '💯', '🔥', '👀'] },
];

const KEY = 'fam-emoji-recent';
function readRecent(): string[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]').slice(0, 16); } catch { return []; } }
function saveRecent(list: string[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 16))); } catch { /* storage off */ } }

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [tab, setTab] = useState(recent.length ? 'recent' : 'smile');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.convo-emoji')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('mousedown', close); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', key); };
  }, [onClose]);
  const pick = (e: string) => { const r = [e, ...recent.filter((x) => x !== e)]; setRecent(r); saveRecent(r); onPick(e); };
  const list = tab === 'recent' ? recent : EMOJI_GROUPS.find((g) => g.key === tab)?.list || [];
  return (
    <div className="emoji-pop" ref={box} role="dialog" aria-label="Emoji">
      <div className="emoji-tabs" role="tablist">
        {recent.length > 0 && <button type="button" role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'on' : ''} title="Recent" onMouseDown={(e) => e.preventDefault()} onClick={() => setTab('recent')}>🕘</button>}
        {EMOJI_GROUPS.map((g) => (
          <button key={g.key} type="button" role="tab" aria-selected={tab === g.key} className={tab === g.key ? 'on' : ''} title={g.label} aria-label={g.label}
            onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(g.key)}>{g.icon}</button>
        ))}
      </div>
      <p className="emoji-h">{tab === 'recent' ? 'Recently used' : EMOJI_GROUPS.find((g) => g.key === tab)?.label}</p>
      <div className="emoji-grid">
        {list.map((e) => <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} aria-label={e}>{e}</button>)}
      </div>
    </div>
  );
}

/** True for a short message made only of emoji (shown larger, like other chat apps). */
export function onlyEmoji(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 24) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u.test(t);
}
