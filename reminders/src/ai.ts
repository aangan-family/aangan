/**
 * Writing help on our API address, run on Cloudflare Workers AI (no other company involved).
 *
 *   POST /ai/rewrite  {text, style}   → {text}             (fix grammar, clearer, shorter, warmer)
 *   POST /ai/voice    audio/wav body   → {text, language}   (any language spoken → English text)
 *
 * Each request carries the member's own sign-in token. Before any AI runs, ai_allow() (0021) checks
 * that they are an active member and counts the use against a daily allowance. Nothing written or
 * said is stored or logged here: the text/audio goes to the model and the answer goes back.
 * The member always reviews the result before anything is sent.
 */
import { SITES as SIGNIN_SITES } from './oauth';
import { PROXY_HEADER, proxyToken } from './keys';

const SITES = SIGNIN_SITES;

interface AiEnv { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; AI?: Ai }

export const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const SPEECH_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const MAX_TEXT = 4000;
export const MAX_AUDIO = 2_400_000; // ~70 s of 16 kHz mono WAV

export const STYLES = {
  grammar: 'Correct the spelling, grammar and punctuation, and write texting shorthand out in full (u → you, ur → your, pls → please, thx → thanks). Otherwise keep the wording, tone and length the same.',
  clearer: 'Rewrite it so it reads clearly and naturally, in complete, well-punctuated sentences. Fix all spelling and grammar and write texting shorthand out in full. Reword or reorder where that helps. Keep every point.',
  shorter: 'Rewrite it noticeably shorter than the original (fewer words), in correct, well-punctuated sentences with texting shorthand written out in full. Keep only the important points.',
  warmer: 'Rewrite it to sound warm and affectionate, like a loving message to close family: a kind greeting, gentle and appreciative words (please, thank you), and a warm closing such as “With love” with a 🙏 or 😊. Use correct, well-punctuated sentences with texting shorthand written out in full.',
} as const;
export type Style = keyof typeof STYLES;

const MENTION = /@\[[^\]\n]{1,80}\]\(person:[A-Za-z0-9_-]{1,40}\)|!\[[^\]\n]{0,200}\]\(photo:[0-9a-fA-F-]{36}\)/g;
const isPhoto = (t: string) => t.startsWith('![');

/** Mentions (`@[Name](person:ID)`) and photos (`![caption](photo:ID)`) must come back exactly, so the model only ever sees ⟦M1⟧, ⟦M2⟧… */
export function protect(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  return { text: text.replace(MENTION, (m) => { tokens.push(m); return `⟦M${tokens.length}⟧`; }), tokens };
}
export function restore(text: string, tokens: string[]): string {
  let out = text.replace(/⟦M(\d+)⟧/g, (m, n) => tokens[Number(n) - 1] ?? '');
  const lost = tokens.filter((t) => !out.includes(t));
  const people = lost.filter((t) => !isPhoto(t)), photos = lost.filter(isPhoto);
  if (people.length) out = people.join(' ') + ' ' + out;
  if (photos.length) out = photos.join('\n') + '\n\n' + out;   // photos sit on lines of their own
  return out;
}

export function rewritePrompt(style: Style): string {
  return [
    'You help members of a large Tamil Iyer family write messages to each other on their private family website.',
    STYLES[style],
    'Reply in the same language the message is written in.',
    'Keep names, Tamil kinship words (Amma, Appa, Paati, Thatha, Mama, Mami, Athimber, Akka, Anna, Chithi, Periappa…), dates, numbers, emoji and links exactly as they are.',
    'Keep any placeholders like ⟦M1⟧ exactly as written; they are people being mentioned or photos, so keep each on its own line if it was.',
    'Keep simple formatting marks (**bold**, *italic*, lines starting with - or 1.) where they are.',
    'Use normal sentence case: a capital letter only at the start of a sentence and for names, never on every word.',
    'Do not add facts or opinions that are not in the message. Do not explain anything.',
    'The result must be clearly better written than the original; never hand back the message unchanged.',
    'Reply with only the rewritten message.',
  ].join(' ');
}

export const TRANSLATE_PROMPT = [
  'Translate what a member of a Tamil family said into natural, simple written English, as they would type it in a family message.',
  'The speech may mix languages (for example Tamil, Malayalam, Hindi, Telugu, Kannada and English).',
  'Keep names and Tamil kinship words such as Amma, Appa, Paati, Thatha, Mama, Akka and Anna as they are.',
  'Do not add anything. Reply with only the English text.',
].join(' ');

/** The model sometimes wraps its answer in quotes or adds "Here is…"; take that off. */
export function tidy(s: string): string {
  let t = (s || '').trim();
  t = t.replace(/^(here(’|')?s|here is)[^\n:]{0,60}:\s*\n?/i, '').trim();
  if (/^["“].*["”]$/s.test(t) && !/["“”]/.test(t.slice(1, -1))) t = t.slice(1, -1).trim();
  return t;
}

/** Whisper's language name or code → whether it's English. */
export const isEnglish = (lang: string | undefined) => !lang || /^(en|english)$/i.test(lang);

const LANGS: Record<string, string> = { ta: 'Tamil', ml: 'Malayalam', hi: 'Hindi', te: 'Telugu', kn: 'Kannada', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', sa: 'Sanskrit', ur: 'Urdu', en: 'English' };
export const languageName = (l?: string) => (l ? LANGS[l.toLowerCase()] || l.charAt(0).toUpperCase() + l.slice(1) : '');

function cors(origin: string | null): Record<string, string> {
  const ok = origin && SITES.includes(origin) ? origin : SITES[0];
  return { 'Access-Control-Allow-Origin': ok, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}

function json(body: object, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(origin) } });
}

/** Asks the database, as the member, whether they may use writing help now (and counts it). */
async function allow(req: Request, env: AiEnv, what: 'rewrite' | 'voice'): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const apikey = req.headers.get('apikey') || '';
  if (!/^Bearer \S+$/.test(auth) || !apikey) return 'Please sign in again.';
  // the database checks the token too (signature and expiry); this is an early, cheap refusal of an expired one
  if (tokenExpired(auth)) return 'Please sign in again.';
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_allow`, {
    method: 'POST', headers: { Authorization: auth, apikey, 'Content-Type': 'application/json', [PROXY_HEADER]: await proxyToken(env.SUPABASE_SERVICE_KEY) }, body: JSON.stringify({ what }),
  });
  if (r.ok) return null;
  const e = await r.json().catch(() => ({})) as { message?: string };
  return e.message || 'Writing help isn’t available right now.';
}

export function tokenExpired(auth: string, now = Date.now()): boolean {
  try {
    const part = auth.replace(/^Bearer\s+/i, '').split('.')[1] || '';
    const { exp } = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof exp !== 'number' || exp * 1000 <= now;
  } catch { return true; }
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function chat(env: AiEnv, system: string, user: string): Promise<string> {
  const r = await env.AI!.run(TEXT_MODEL as Parameters<Ai['run']>[0], { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 1500, temperature: 0.3 } as never) as { response?: string };
  return tidy(r?.response || '');
}

export async function ai(req: Request, env: AiEnv): Promise<Response> {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404, origin);
  if (origin && !SITES.includes(origin)) return json({ error: 'Not allowed' }, 403, origin);
  if (!env.AI) return json({ error: 'Writing help isn’t switched on yet.' }, 503, origin);
  const path = new URL(req.url).pathname;
  try {
    if (path === '/ai/rewrite') {
      const b = await req.json().catch(() => null) as { text?: unknown; style?: unknown } | null;
      const text = typeof b?.text === 'string' ? b.text.trim() : '';
      const style = typeof b?.style === 'string' && b.style in STYLES ? b.style as Style : null;
      if (!text || !style) return json({ error: 'Write something first.' }, 400, origin);
      if (text.length > MAX_TEXT) return json({ error: `That’s too long for writing help (up to ${MAX_TEXT} characters).` }, 400, origin);
      const no = await allow(req, env, 'rewrite');
      if (no) return json({ error: no }, 403, origin);
      const p = protect(text);
      const out = await chat(env, rewritePrompt(style), p.text);
      if (!out) return json({ error: 'Writing help couldn’t come up with anything. Try again.' }, 502, origin);
      return json({ text: restore(out, p.tokens) }, 200, origin);
    }
    if (path === '/ai/voice') {
      const len = Number(req.headers.get('content-length') || 0);
      if (len > MAX_AUDIO) return json({ error: 'That was a bit long. Keep it under a minute.' }, 413, origin);
      const no = await allow(req, env, 'voice');
      if (no) return json({ error: no }, 403, origin);
      const audio = new Uint8Array(await req.arrayBuffer());
      if (audio.length > MAX_AUDIO) return json({ error: 'That was a bit long. Keep it under a minute.' }, 413, origin);
      if (audio.length < 1000) return json({ error: 'I didn’t hear anything. Hold the microphone and speak.' }, 400, origin);
      const r = await env.AI.run(SPEECH_MODEL as Parameters<Ai['run']>[0], { audio: base64(audio), task: 'transcribe', vad_filter: true } as never) as { text?: string; transcription_info?: { language?: string } };
      const heard = (r?.text || '').trim();
      const lang = r?.transcription_info?.language;
      if (!heard) return json({ error: 'I didn’t catch that. Try again a little closer to the phone.' }, 422, origin);
      const text = isEnglish(lang) ? heard : (await chat(env, TRANSLATE_PROMPT, heard)) || heard;
      return json({ text, language: languageName(lang) }, 200, origin);
    }
    return json({ error: 'Not found' }, 404, origin);
  } catch (e) {
    console.log('ai error', path, String(e).slice(0, 200));
    return json({ error: 'Writing help isn’t available right now. Please try again in a minute.' }, 502, origin);
  }
}
