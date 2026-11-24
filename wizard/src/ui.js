// Small DOM helpers. Text is always set as text, never as HTML.

export function h(tag, attrs = {}, ...kids) {
  const svg = ['svg', 'path', 'rect', 'circle', 'g', 'line', 'text', 'title'].includes(tag);
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'value' && !svg) el.value = v;
    else if (k === 'checked' && !svg) el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Select and copy'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
}

/** The brand pieces every page shares: the logo and the people band. */
/** big = the fine stroke for large sizes; small sizes use a bolder cut so the script stays legible */
export const logo = (white = false, cls = 'logo', big = false) => h('img', { class: cls, src: `brand/${white ? 'logo-white' : 'logo'}${big ? '' : '-bold'}.png`, alt: 'aangan', width: 1200, height: 320 });
export const people = (cls = 'people') => h('div', { class: cls, role: 'img', 'aria-label': 'Indian families of many communities, together' });
