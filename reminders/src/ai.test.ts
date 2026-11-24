import { describe, expect, it, vi, afterEach } from 'vitest';
import { ai, protect, restore, tidy, isEnglish, languageName, rewritePrompt } from './ai';

const SITE = 'https://ourfamily.example';
const req = (path: string, body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://api.ourfamily.example' + path, { method: 'POST', body, headers: { origin: SITE, authorization: `Bearer x.${btoa(JSON.stringify({ exp: 4102444800 })).replace(/=+$/, '')}.y`, apikey: 'anon', ...headers } });

afterEach(() => vi.unstubAllGlobals());


describe('photos in posts survive a rewrite', () => {
  const ph = '![Thatha and Paati](photo:0f8fad5b-d9cb-469f-a165-70867728950e)';
  it('masks photos like mentions', () => {
    const p = protect(`Look\n${ph}\nlovely`);
    expect(p.text).toBe('Look\n⟦M1⟧\nlovely');
    expect(restore('Look!\n⟦M1⟧\nLovely.', p.tokens)).toBe(`Look!\n${ph}\nLovely.`);
  });
  it('puts a dropped photo back on its own line', () => {
    const p = protect(`${ph}\nhi`);
    expect(restore('Hello.', p.tokens)).toBe(`${ph}\n\nHello.`);
  });
});

describe('mentions survive a rewrite', () => {
  it('hides and restores them exactly', () => {
    const t = 'Thanks @[Ananya Ramesh](person:R12) and @[Bala](person:B1)!';
    const p = protect(t);
    expect(p.text).toBe('Thanks ⟦M1⟧ and ⟦M2⟧!');
    expect(restore('Thank you so much, ⟦M1⟧ and ⟦M2⟧!', p.tokens)).toBe('Thank you so much, @[Ananya Ramesh](person:R12) and @[Bala](person:B1)!');
  });
  it('puts back any the model dropped', () => {
    const p = protect('Hi @[Bala](person:B1) how are you');
    expect(restore('Hello, how are you?', p.tokens)).toBe('@[Bala](person:B1) Hello, how are you?');
  });
});

describe('tidy', () => {
  it('takes off "Here is…" and wrapping quotes', () => {
    expect(tidy('Here is the rewritten message:\n"Happy birthday Akka!"')).toBe('Happy birthday Akka!');
    expect(tidy('He said "hi" to me')).toBe('He said "hi" to me');
  });
});

describe('languages', () => {
  it('knows English and names others', () => {
    expect(isEnglish('en')).toBe(true);
    expect(isEnglish('english')).toBe(true);
    expect(isEnglish('ta')).toBe(false);
    expect(languageName('ta')).toBe('Tamil');
    expect(languageName('ml')).toBe('Malayalam');
  });
  it('asks for the same language back and no additions', () => {
    expect(rewritePrompt('warmer')).toMatch(/same language/);
    expect(rewritePrompt('grammar')).toMatch(/⟦M1⟧/);
  });
});

describe('the endpoint', () => {
  const okDb = () => vi.stubGlobal('fetch', vi.fn(async () => new Response('58', { status: 200 })));
  const env = (run: (m: string, i: unknown) => unknown) => ({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'sb_secret_test', AI: { run: vi.fn(async (m: string, i: unknown) => run(m, i)) } as unknown as Ai });

  it('answers the browser’s preflight only for our sites', async () => {
    const r = await ai(new Request('https://api.ourfamily.example/ai/rewrite', { method: 'OPTIONS', headers: { origin: SITE } }), env(() => ({})));
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE);
    const bad = await ai(req('/ai/rewrite', '{}', { origin: 'https://evil.example' }), env(() => ({})));
    expect(bad.status).toBe(403);
  });

  it('runs no AI for someone the database refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Only family members who have joined can use writing help.' }), { status: 400 })));
    const e = env(() => ({ response: 'x' }));
    const r = await ai(req('/ai/rewrite', JSON.stringify({ text: 'hi', style: 'warmer' })), e);
    expect(r.status).toBe(403);
    expect((await r.json() as { error: string }).error).toMatch(/Only family members/);
    expect(e.AI!.run).not.toHaveBeenCalled();
  });

  it('refuses without a sign-in token', async () => {
    const r = await ai(req('/ai/rewrite', JSON.stringify({ text: 'hi', style: 'warmer' }), { authorization: '' }), env(() => ({})));
    expect(r.status).toBe(403);
  });

  it('rewrites, keeping mentions', async () => {
    okDb();
    const e = env((_m, i) => { const u = (i as { messages: { content: string }[] }).messages[1].content; expect(u).not.toContain('person:'); return { response: 'Many thanks, ⟦M1⟧!' }; });
    const r = await ai(req('/ai/rewrite', JSON.stringify({ text: 'thx @[Bala](person:B1)', style: 'warmer' })), e);
    expect(await r.json()).toEqual({ text: 'Many thanks, @[Bala](person:B1)!' });
  });

  it('turns Tamil speech into English, and leaves English as it was said', async () => {
    okDb();
    const wav = new Uint8Array(4000);
    const tamil = env((m) => m.includes('whisper') ? { text: 'அக்கா பிறந்தநாள் வாழ்த்துக்கள்', transcription_info: { language: 'ta' } } : { response: 'Happy birthday, Akka!' });
    expect(await (await ai(req('/ai/voice', wav, { 'content-type': 'audio/wav' }), tamil)).json()).toEqual({ text: 'Happy birthday, Akka!', language: 'Tamil' });
    const english = env((m) => m.includes('whisper') ? { text: ' See you on Sunday. ', transcription_info: { language: 'en' } } : { response: 'WRONG' });
    expect(await (await ai(req('/ai/voice', wav, { 'content-type': 'audio/wav' }), english)).json()).toEqual({ text: 'See you on Sunday.', language: 'English' });
  });

  it('refuses audio that is too long', async () => {
    okDb();
    const r = await ai(req('/ai/voice', new Uint8Array(10), { 'content-length': '9000000' }), env(() => ({})));
    expect(r.status).toBe(413);
  });
});

describe('token expiry (defence in depth)', async () => {
  const { tokenExpired } = await import('./ai');
  const tok = (exp: number) => 'Bearer x.' + btoa(JSON.stringify({ exp })).replace(/=+$/, '') + '.y';
  it('refuses an expired or unreadable token before asking the database', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    expect(tokenExpired(tok(now / 1000 + 600), now)).toBe(false);
    expect(tokenExpired(tok(now / 1000 - 1), now)).toBe(true);
    expect(tokenExpired('Bearer garbage', now)).toBe(true);
  });
});
