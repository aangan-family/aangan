// Email without a domain (the free .pages.dev setup): send through the admin's own Gmail with an app password
// (Google account → Security → 2-Step Verification → App passwords). Up to 500 emails a day, signed by Gmail itself,
// so they arrive. Used only when RESEND_API_KEY isn't set and GMAIL_USER + GMAIL_APP_PASSWORD are (Worker secrets).
// A tiny SMTP client over Cloudflare's TCP sockets: implicit TLS on 465, AUTH LOGIN, one message per connection.

export interface SmtpEnv { GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string }
export const gmailReady = (env: SmtpEnv) => !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);

export interface SmtpMessage { from: string; to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> }

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
/** RFC 2047 for a header with anything outside plain ASCII (names in Indian scripts, emoji). */
export const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const encodeFrom = (from: string) => { const m = from.match(/^(.*)<([^>]+)>\s*$/); return m ? `${encodeHeader(m[1].trim())} <${m[2]}>` : from; };
/** Base64 body in 76-character lines. */
const body64 = (s: string) => (b64(s).match(/.{1,76}/g) || []).join('\r\n');
/** The bare address in "Name <a@b>" or "a@b". */
export const addressOf = (s: string) => (s.match(/<([^>]+)>/)?.[1] || s).trim();

/** The whole message as SMTP DATA (pure, tested). Lines starting with "." are dot-stuffed. */
export function mime(m: SmtpMessage, boundary = 'b' + crypto.randomUUID().replace(/-/g, '')): string {
  const head = [
    `From: ${encodeFrom(m.from)}`,
    `To: ${m.to.join(', ')}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${addressOf(m.from).split('@')[1] || 'mail'}>`,
    'MIME-Version: 1.0',
    ...Object.entries(m.headers || {}).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body64(m.text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body64(m.html),
    `--${boundary}--`, '',
  ];
  return [...head, '', ...parts].join('\r\n').replace(/^\./gm, '..');
}

/** Send one message through smtp.gmail.com. Returns ok and the server's last reply. */
export async function sendGmail(env: SmtpEnv, m: SmtpMessage): Promise<{ ok: boolean; status: number; body: string }> {
  const { connect } = await import('cloudflare:sockets');
  const sock = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  const w = sock.writable.getWriter(), r = sock.readable.getReader();
  const dec = new TextDecoder(); let buf = '';
  const reply = async (): Promise<[number, string]> => {
    // a reply ends with a line "NNN text" (a dash after the code means more lines follow)
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const all = lines.slice(0, i + 1).join('\n'); buf = lines.slice(i + 1).join('\r\n'); return [Number(lines[i].slice(0, 3)), all]; }
      const { value, done } = await r.read(); if (done) throw new Error('SMTP connection closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  const send = async (line: string, expect: number[]) => {
    await w.write(new TextEncoder().encode(line + '\r\n'));
    const [code, text] = await reply();
    if (!expect.includes(code)) throw Object.assign(new Error(text), { code });
    return text;
  };
  try {
    const [hello] = await reply(); if (hello !== 220) throw new Error('SMTP greeting ' + hello);
    await send('EHLO aangan', [250]);
    await send('AUTH LOGIN', [334]);
    await send(b64(env.GMAIL_USER!), [334]);
    await send(b64(env.GMAIL_APP_PASSWORD!), [235]);
    await send(`MAIL FROM:<${env.GMAIL_USER}>`, [250]);
    for (const to of m.to) await send(`RCPT TO:<${addressOf(to)}>`, [250, 251]);
    await send('DATA', [354]);
    const last = await send(mime(m) + '\r\n.', [250]);
    await send('QUIT', [221]).catch(() => '');
    return { ok: true, status: 250, body: last };
  } catch (e) {
    return { ok: false, status: (e as { code?: number }).code || 500, body: String((e as Error).message).slice(0, 300) };
  } finally {
    try { await sock.close(); } catch { /* already closed */ }
  }
}
