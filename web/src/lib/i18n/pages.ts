// Page text in the member's language (Theme → Menus in → "Pages too"), Nov 2026.
//
// Rather than wrap every phrase in code, this swaps exact interface phrases on the page for their translation
// (lib/i18n/<lang>.json, keyed by the English in phrases.json), like a phrasebook: a text node or attribute whose whole
// text is a known phrase is translated, anything else stays as it is. People's own words are never touched: whatever
// sits inside translate="no" (posts, messages, names, stories), inputs, text boxes and code is skipped, and a phrase
// only matches when it is the entire text of its node. Missing translations show in English.
// Kept on this device, like the menu language. First drafts: marked as such in Theme until a native speaker checks them.
import { useSyncExternalStore } from 'react';

export const PAGE_LANGS = ['hi', 'ta'] as const;
const KEY = 'fam-page-lang';
const EVT = 'fam-page-lang';
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const SKIP = 'textarea, input, select option, script, style, code, pre, [contenteditable="true"], [translate="no"], [data-no-translate]';

export const hasPages = (lang: string) => (PAGE_LANGS as readonly string[]).includes(lang);
export function pagesOn(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function setPagesOn(on: boolean) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* storage off */ }
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new Event(EVT));
}
const subscribe = (f: () => void) => { addEventListener(EVT, f); return () => removeEventListener(EVT, f); };
export const usePagesOn = () => useSyncExternalStore(subscribe, pagesOn, () => false);

/** Pure: the translation of a node's whole text, keeping its surrounding spaces; null when it isn't a known phrase. */
export function translateText(text: string, dict: Record<string, string>): string | null {
  const core = text.replace(/\s+/g, ' ').trim();
  if (!core || core.length > 200) return null;
  const t = dict[core];
  if (!t || t === core) return null;
  const lead = text.match(/^\s*/)![0], trail = text.match(/\s*$/)![0];
  return lead + t + trail;
}

const dicts = new Map<string, Record<string, string>>();
async function load(lang: string): Promise<Record<string, string>> {
  if (!dicts.has(lang)) {
    const mod = lang === 'hi' ? await import('./hi.json') : lang === 'ta' ? await import('./ta.json') : { default: {} };
    const d = { ...(mod.default as Record<string, string>) }; delete d._note;
    dicts.set(lang, d);
  }
  return dicts.get(lang)!;
}

// What we changed, so it can be put back (switching off, or React writing English again).
const originals = new WeakMap<Text, string>();
const origAttrs = new WeakMap<Element, Map<string, string>>();
let observer: MutationObserver | null = null;
let active: Record<string, string> | null = null;

const skipped = (el: Element | null) => !!el?.closest(SKIP);
// hints on boxes (placeholder, aria-label) are interface text; only what people type is theirs
const ATTR_SKIP = '[contenteditable="true"], [translate="no"], [data-no-translate], code, pre';

function doText(n: Text) {
  if (!active || skipped(n.parentElement)) return;
  const v = n.nodeValue || '';
  const known = originals.get(n);
  if (known !== undefined && translateText(known, active) === v) return;   // already ours
  const t = translateText(v, active);
  if (t !== null) { originals.set(n, v); n.nodeValue = t; }
}
function doAttrs(el: Element) {
  if (!active || el.closest(ATTR_SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (!v) continue;
    const saved = origAttrs.get(el);
    if (saved?.has(a) && translateText(saved.get(a)!, active) === v) continue;
    const t = translateText(v, active);
    if (t !== null) { (saved || origAttrs.set(el, new Map()).get(el)!).set(a, v); el.setAttribute(a, t); }
  }
}
function walk(root: Node) {
  if (root.nodeType === 3) { doText(root as Text); return; }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  doAttrs(el);
  if (skipped(el) && !el.matches('input, textarea')) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n as Text) : doAttrs(n as Element);
}
function restore(root: Node) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) { const o = originals.get(n as Text); if (o !== undefined) { (n as Text).nodeValue = o; originals.delete(n as Text); } }
    else { const m = origAttrs.get(n as Element); if (m) { for (const [a, v] of m) (n as Element).setAttribute(a, v); origAttrs.delete(n as Element); } }
  }
}

/** Start (or stop) translating the page for this language. Safe to call again whenever the choice changes. */
export async function applyPageLang(lang: string, on: boolean, root: Element | null = typeof document !== 'undefined' ? document.body : null) {
  if (!root) return;
  observer?.disconnect(); observer = null;
  if (active) { active = null; restore(root); }
  if (!on || !hasPages(lang)) { document.documentElement.removeAttribute('data-pages'); return; }
  active = await load(lang);
  document.documentElement.dataset.pages = lang;
  walk(root);
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}
