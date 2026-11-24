/**
 * Scrolling that never moves the page frame.
 *
 * The app's shell (html, body, #root, .layout) must never scroll: only <main> and inner lists do.
 * `el.scrollIntoView()` scrolls *every* ancestor, including overflow:hidden ones, so on iPhone it
 * could shift the whole page up (top bar gone, empty band at the bottom) until the next page change.
 * `revealIn()` scrolls only the nearest scrolling box; `pinShell()` snaps the frame back if anything moved it.
 */
const SHELL = () => [document.scrollingElement, document.documentElement, document.body, document.getElementById('root'), document.querySelector('.layout')]
  .filter((x, i, a): x is Element => !!x && a.indexOf(x) === i);

/** Pinch-zoomed (iPhone/iPad): the zoomed view's position shows up as page scroll, so leave it alone. */
const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

/** Typing on a phone: iOS moves the page itself to keep the text box above the keyboard. Don't fight it. */
const typing = () => {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return true;
  const vv = window.visualViewport;
  return !!vv && vv.height < window.innerHeight - 120;   // keyboard still up
};

export function pinShell() {
  if (zoomed() || typing()) return;
  for (const el of SHELL()) if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; }
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
}

function scroller(el: Element): HTMLElement | null {
  const shell = new Set<Element>(SHELL());
  for (let p = el.parentElement; p && !shell.has(p); p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Like scrollIntoView, but only scrolls the box the element lives in (usually <main>). */
export function revealIn(el: Element | null | undefined, { block = 'start', behavior = 'smooth' }: { block?: 'start' | 'center' | 'end' | 'nearest'; behavior?: ScrollBehavior } = {}) {
  if (!el) return;
  const box = scroller(el);
  if (!box) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const pad = block === 'start' ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0;
  let top = box.scrollTop + (r.top - b.top);
  if (block === 'start') top -= pad;
  else if (block === 'center') top -= (box.clientHeight - r.height) / 2;
  else if (block === 'end') top -= box.clientHeight - r.height;
  else { if (r.top >= b.top && r.bottom <= b.bottom) return; if (r.bottom > b.bottom) top -= box.clientHeight - r.height; }
  box.scrollTo({ top: Math.max(0, top), behavior });
  pinShell();
}
