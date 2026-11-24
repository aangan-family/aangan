import { Fragment, type ReactNode } from 'react';

/**
 * A small, safe formatter for the family story. Text is stored with simple markers
 * and turned into React elements (never raw HTML), so nothing can be injected.
 *
 *   **bold**   *italic*   ~~struck~~   [link text](https://…)   @[Name](person:ID) mentions
 *   ## Heading   ### Subheading   - bullet   1. numbered   > quote
 *   A blank line starts a new paragraph.
 *   ![caption](photo:UUID) on its own line shows a photo from Photos (Talk only; `photo` renders it).
 *   `extended` (DevCenter only) adds: `code`, | tables |, - [ ] / - [x] checklists, \_ escapes.
 */
export function inline(text: string, key = 'i', ext = false): ReactNode[] {
  if (ext) {
    // `code` spans first: their contents are shown exactly as written
    const parts = text.split(/(`[^`\n]+`)/g);
    if (parts.length > 1) return parts.flatMap((part, i): ReactNode[] => (/^`[^`]+`$/.test(part) ? [<code key={`${key}-c${i}`}>{part.slice(1, -1)}</code>] : inline(part, `${key}-c${i}`, false).map((x) => (typeof x === 'string' ? unescapeMd(x) : x))));
    return inline(text, key, false).map((x) => (typeof x === 'string' ? unescapeMd(x) : x));
  }
  const out: ReactNode[] = [];
  const re = /(@\[([^\]\n]{1,80})\]\(person:([A-Za-z0-9]{1,20})\))|(\*\*([^*]+?)\*\*)|(\*([^*\s][^*]*?)\*)|(~~([^~]+?)~~)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2] !== undefined) out.push(<a key={k} className="mention" href={`#/p/${m[3]}`}>@{m[2]}</a>);
    else if (m[5] !== undefined) out.push(<strong key={k}>{inline(m[5], k)}</strong>);
    else if (m[7] !== undefined) out.push(<em key={k}>{inline(m[7], k)}</em>);
    else if (m[9] !== undefined) out.push(<s key={k}>{inline(m[9], k)}</s>);
    else out.push(<a key={k} href={m[12]} target="_blank" rel="noopener noreferrer">{m[11]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const unescapeMd = (s: string) => s.replace(/\\([_*~`#\[\]|\\])/g, '$1').replace(/&#91;/g, '[');
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

/** A photo from the Photos section, on its own line: ![caption](photo:<uuid>). */
export const PHOTO_LINE = /^\s*!\[([^\]\n]{0,200})\]\(photo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i;
const PHOTO_ANY = /!\[([^\]\n]{0,200})\]\(photo:[0-9a-f-]{36}\)/gi;
export const photoToken = (id: string, caption = '') => `![${caption.replace(/[[\]\n]/g, ' ').trim().slice(0, 200)}](photo:${id})`;
/** Photos in a post, in order, once each. */
export function photosIn(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) { const m = line.match(PHOTO_LINE); if (m && !out.includes(m[2].toLowerCase())) out.push(m[2].toLowerCase()); }
  return out;
}
/** Preview text for a photo token: "📷 caption". */
export const photoPlain = (s: string) => s.replace(PHOTO_ANY, (_m, c: string) => `📷 ${c.trim() || 'Photo'}`);
/** At most this many photos are shown in one post. */
export const MAX_PHOTOS = 8;

export function RichText({ text, className, extended = false, photo }: { text: string; className?: string; extended?: boolean;
  /** renders a photo line; without it the line shows as "📷 caption" */
  photo?: (id: string, caption: string) => ReactNode }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  const il = (t: string, k = 'i') => inline(t, k, extended);
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  let table: string[][] = [];
  let gallery: { id: string; caption: string }[] = [];
  let shownPhotos = 0;
  const flush = () => {
    const k = `b${blocks.length}`;
    if (gallery.length) {
      blocks.push(photo
        ? <div key={k + 'g'} className={`postphotos n${Math.min(gallery.length, 3)}`}>{gallery.map((g) => <Fragment key={g.id}>{photo(g.id, g.caption)}</Fragment>)}</div>
        : <p key={k + 'g'} className="photoref">{gallery.map((g) => `📷 ${g.caption || 'Photo'}`).join('  ')}</p>);
      gallery = [];
    }
    if (para.length) { blocks.push(<p key={k + 'p'}>{para.flatMap((l, i) => (i ? [<br key={i} />, ...il(l, `${k}-${i}`)] : il(l, `${k}-${i}`)))}</p>); para = []; }
    if (list) {
      const L = list.kind;
      blocks.push(<L key={k + 'l'} className={extended && list.items.some((it) => /^\[[ xX]\]\s/.test(it)) ? 'checklist' : undefined}>{list.items.map((it, i) => {
        const c = extended ? it.match(/^\[([ xX])\]\s+(.*)$/) : null;
        return c ? <li key={i} className={c[1] === ' ' ? 'todo' : 'done'}><span className="tick" aria-label={c[1] === ' ' ? 'To do' : 'Done'}>{c[1] === ' ' ? '☐' : '☑'}</span> {il(c[2], `${k}-${i}`)}</li> : <li key={i}>{il(it, `${k}-${i}`)}</li>;
      })}</L>);
      list = null;
    }
    if (quote.length) { blocks.push(<blockquote key={k + 'q'}>{il(quote.join(' '), k)}</blockquote>); quote = []; }
    if (table.length) {
      const [head, ...rows] = table;
      blocks.push(<div key={k + 't'} className="rtable"><table><thead><tr>{head.map((c, i) => <th key={i}>{il(c, `${k}-h${i}`)}</th>)}</tr></thead>
        <tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, i) => <td key={i}>{il(c, `${k}-${j}-${i}`)}</td>)}</tr>)}</tbody></table></div>);
      table = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) { if (!gallery.length) flush(); continue; }
    const pm = line.match(PHOTO_LINE);
    if (pm) {
      if (!gallery.length) flush();
      const id = pm[2].toLowerCase();
      if (shownPhotos < MAX_PHOTOS && !gallery.some((g) => g.id === id)) { gallery.push({ id, caption: pm[1].trim() }); shownPhotos++; }
      continue;
    }
    if (gallery.length) flush();
    if (extended && /^\s*\|.*\|\s*$/.test(line)) {
      if (!table.length) flush();
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table.push(cells(line));
      continue;
    }
    if (table.length) flush();
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); const H = m[1].length === 2 ? 'h4' : 'h5'; blocks.push(<H key={`b${blocks.length}`} id={extended ? slug(m[2]) : undefined}>{il(m[2])}</H>); continue; }
    if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) { if (!list || list.kind !== 'ul') { flush(); list = { kind: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (!list || list.kind !== 'ol') { flush(); list = { kind: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { if (!quote.length) flush(); quote.push(m[1]); continue; }
    if (list || quote.length) flush();
    para.push(line);
  }
  flush();
  return <div className={`rich ${className || ''}`}>{blocks}</div>;
}

/** Anchor id for a heading (DevCenter's contents list). */
export const slug = (s: string) => 'h-' + s.toLowerCase().replace(/[`*_\\]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Wrap or prefix the selected text in a textarea; returns the new value and selection. */
export function applyFormat(value: string, start: number, end: number, kind: 'bold' | 'italic' | 'strike' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'link', url?: string) {
  const sel = value.slice(start, end);
  const wrap = (a: string, b = a, placeholder = 'text') => {
    const inner = sel || placeholder;
    const v = value.slice(0, start) + a + inner + b + value.slice(end);
    return { value: v, start: start + a.length, end: start + a.length + inner.length };
  };
  if (kind === 'bold') return wrap('**');
  if (kind === 'italic') return wrap('*');
  if (kind === 'strike') return wrap('~~');
  if (kind === 'link') return wrap('[', `](${url || 'https://'})`, 'link text');
  // line formats: apply to every selected line
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  const le = value.indexOf('\n', end); const lineEnd = le === -1 ? value.length : le;
  const prefix = (i: number) => (kind === 'h2' ? '## ' : kind === 'h3' ? '### ' : kind === 'ul' ? '- ' : kind === 'ol' ? `${i + 1}. ` : '> ');
  const strip = (l: string) => l.replace(/^(#{2,3}\s+|\s*[-•*]\s+|\s*\d+[.)]\s+|>\s?)/, '');
  const block = value.slice(ls, lineEnd).split('\n').map((l, i) => prefix(i) + strip(l)).join('\n');
  const v = value.slice(0, ls) + block + value.slice(lineEnd);
  return { value: v, start: ls, end: ls + block.length };
}

/** Who is mentioned in a text: the ids in @[Name](person:ID), once each (the database works this out the same way). */
export function mentionIds(text: string): string[] {
  return [...new Set([...text.matchAll(/@\[[^\]\n]{1,80}\]\(person:([A-Za-z0-9]{1,20})\)/g)].map((m) => m[1]))].slice(0, 30);
}
/** Plain text for previews: mentions become @Name, formatting markers go. */
export function plainText(text: string): string {
  return photoPlain(text).replace(/@\[([^\]\n]{1,80})\]\(person:[A-Za-z0-9]{1,20}\)/g, '@$1').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/[*~]{1,2}|^#{2,3}\s+|^>\s?|^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
}
