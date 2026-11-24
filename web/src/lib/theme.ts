import { MODES, THEMES, type Mode, type Theme } from './types';

/** Theme = colour or style (data-theme on <html>); mode = light, dark or automatic (data-mode). Remembered on this device and on the account. */
const KEY = 'fam-theme';
const MODE_KEY = 'fam-mode';
export function savedTheme(): Theme {
  try { const t = localStorage.getItem(KEY) as Theme | null; if (t && THEMES.includes(t)) return t; } catch { /* storage off */ }
  return 'blue';
}
export function savedMode(): Mode {
  try { const m = localStorage.getItem(MODE_KEY) as Mode | null; if (m && MODES.includes(m)) return m; } catch { /* storage off */ }
  return 'auto';
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage off */ }
  syncBarColour();
}
export function applyMode(m: Mode) {
  if (m === 'auto') delete document.documentElement.dataset.mode; else document.documentElement.dataset.mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage off */ }
  syncBarColour();
}
/** Is the page dark right now (chosen, or automatic and the phone is dark)? */
export function isDark(): boolean {
  const m = document.documentElement.dataset.mode;
  if (m === 'dark') return true;
  if (m === 'light') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}
/** The phone's status bar colour follows the page. */
function syncBarColour() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (isDark() ? '#000000' : '#f5f5f7');
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => { m.setAttribute('content', bg.startsWith('#') ? bg : isDark() ? '#000000' : '#f5f5f7'); m.removeAttribute('media'); });
}

/** Text size: bigger words and buttons for anyone who wants them. Kept on this device only (a phone and a laptop often want different sizes). */
export type TextSize = 'normal' | 'large' | 'larger';
export const TEXT_SIZES: [TextSize, string][] = [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']];
const TEXT_KEY = 'fam-text';
export function savedTextSize(): TextSize {
  try { const t = localStorage.getItem(TEXT_KEY); if (t === 'large' || t === 'larger') return t; } catch { /* storage off */ }
  return 'normal';
}
export function applyTextSize(t: TextSize) {
  if (t === 'normal') delete document.documentElement.dataset.text; else document.documentElement.dataset.text = t;
  try { localStorage.setItem(TEXT_KEY, t); } catch { /* storage off */ }
}
