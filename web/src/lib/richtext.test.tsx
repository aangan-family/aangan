import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RichText, applyFormat, photosIn, photoToken, plainText } from './richtext';

const html = (t: string) => renderToStaticMarkup(<RichText text={t} />);

describe('family story formatting', () => {
  it('bold, italic, strike and links', () => {
    expect(html('A **tharavad** is *home* ~~house~~')).toContain('<p>A <strong>tharavad</strong> is <em>home</em> <s>house</s></p>');
    expect(html('[Temple](https://example.com/t)')).toContain('<a href="https://example.com/t" target="_blank" rel="noopener noreferrer">Temple</a>');
  });
  it('never makes unsafe links or raw HTML', () => {
    const h = html('[x](javascript:alert(1)) <img src=x onerror=alert(1)> <script>bad()</script>');
    expect(h).not.toContain('<a');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<script');
    expect(h).toContain('&lt;script&gt;');
  });
  it('headings, lists, quotes and paragraphs', () => {
    const h = html('## Roots\nWe came from Thanjavur.\nOn Big Street.\n\n- Avani Avittam\n- Pongal\n\n1. First\n2. Second\n\n> Keep the lamp lit');
    expect(h).toContain('<h4>Roots</h4>');
    expect(h).toContain('<p>We came from Thanjavur.<br/>On Big Street.</p>');
    expect(h).toContain('<ul><li>Avani Avittam</li><li>Pongal</li></ul>');
    expect(h).toContain('<ol><li>First</li><li>Second</li></ol>');
    expect(h).toContain('<blockquote>Keep the lamp lit</blockquote>');
  });
  it('toolbar wraps the selection or the selected lines', () => {
    expect(applyFormat('our kavu', 4, 8, 'bold')).toEqual({ value: 'our **kavu**', start: 6, end: 10 });
    expect(applyFormat('a\nb', 0, 3, 'ul').value).toBe('- a\n- b');
    expect(applyFormat('- a\n- b', 0, 7, 'ol').value).toBe('1. a\n2. b');
    expect(applyFormat('Roots', 2, 2, 'h2').value).toBe('## Roots');
  });
});

describe('extended formatting (DevCenter)', () => {
  const ext = (t: string) => renderToStaticMarkup(<RichText text={t} extended />);
  it('tables, code, checklists and escapes', () => {
    const h = ext('| Check | How often |\n| --- | --- |\n| `Website` | Every **10** min |\n\n- [x] Backups\n- [ ] Review\n\nKey RESEND\\_API\\_KEY');
    expect(h).toContain('<th>Check</th><th>How often</th>');
    expect(h).toContain('<td><code>Website</code></td><td>Every <strong>10</strong> min</td>');
    expect(h).not.toContain('---');
    expect(h).toContain('class="checklist"');
    expect(h).toContain('<li class="done">');
    expect(h).toContain('<li class="todo">');
    expect(h).toContain('RESEND_API_KEY');
  });
  it('code is shown as written and stays safe', () => {
    const h = ext('Run `<script>x</script> **not bold**`');
    expect(h).toContain('<code>&lt;script&gt;x&lt;/script&gt; **not bold**</code>');
  });
  it('the family story does not get tables', () => {
    expect(html('| a | b |\n| - | - |')).not.toContain('<table');
  });
  it('photos from Photos on their own lines, only through the renderer', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e', id2 = '1f8fad5b-d9cb-469f-a165-70867728950f';
    const t = `Hello\n${photoToken(id, 'Thatha [1985]')}\n${photoToken(id2)}\nMore`;
    expect(photoToken(id, 'a]b')).toBe(`![a b](photo:${id})`);
    expect(photosIn(t)).toEqual([id, id2]);
    const h = renderToStaticMarkup(<RichText text={t} photo={(i, c) => <i data-p={i}>{c}</i>} />);
    expect(h).toContain(`<div class="postphotos n2"><i data-p="${id}">Thatha  1985</i><i data-p="${id2}"></i></div>`);
    expect(h).toContain('<p>Hello</p>');
    expect(html(t)).toContain('📷 Thatha  1985');
    expect(html(t)).not.toContain('<img');
    expect(html(`![x](photo:../../etc)`)).not.toContain('postphotos');
    expect(plainText(t)).toBe('Hello 📷 Thatha 1985 📷 Photo More');
  });
});

