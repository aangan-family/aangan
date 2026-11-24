import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertEmail, FIX, healthPass, jobChecks, problemsOf } from './health';

const now = new Date('2026-11-15T04:00:00Z');
const q = (o: object = {}) => ({ welcome_stuck: 0, mentions_stuck: 0, joins_stuck: 0, members: 30, runs: {}, ...o });
afterEach(() => vi.unstubAllGlobals());

describe('job checks', () => {
  it('all quiet is ok', () => {
    const c = jobChecks(q({ runs: { digest: { last_ok_at: '2026-11-15T01:30:05Z', ok: true }, emails: { ok: true } } }), now);
    expect(c.every((x) => x.ok)).toBe(true);
  });
  it('waiting emails and a missed digest are problems', () => {
    const c = jobChecks(q({ welcome_stuck: 2, joins_stuck: 1, runs: { digest: { last_ok_at: '2026-11-13T01:30:00Z', ok: false, detail: 'email failed: 401' } } }), now);
    const p = problemsOf(c);
    expect(p.map((x) => x.key)).toEqual(['emails', 'digest']);
    expect(p[0].summary).toContain('2 welcome, 1 join-request');
    expect(p[1].summary).toContain('401');
  });
  it('no false alarm before the digest has ever run', () => {
    expect(problemsOf(jobChecks(q(), now))).toEqual([]);
  });
});

describe('alert email', () => {
  it('names the problem and what to do', () => {
    const m = alertEmail({ started: [{ key: 'database', summary: 'Database: answered 503' }], still: [], cleared: [] })!;
    expect(m.subject).toBe('⚠️ ourfamily.example: Database needs attention');
    expect(m.text).toContain(FIX.database);
    expect(m.html).toContain('Restore');
  });
  it('sends an all-clear', () => {
    const m = alertEmail({ started: [], still: [], cleared: [{ key: 'site', summary: 'Website: answered 522', since: '2026-11-15T03:00:00Z' }] })!;
    expect(m.subject).toBe('✅ ourfamily.example: all working again');
  });
  it('nothing to say, no email', () => {
    expect(alertEmail({ started: [], still: [], cleared: [] })).toBeNull();
  });
});

describe('health pass', () => {
  const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'svc', RESEND_API_KEY: 're', REMINDER_EMAIL: 'admin@example.com', AI: { run: async () => ({ response: 'ok' }) } as unknown as Ai };
  it('emails only what the database says is new', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://ourfamily.example/') return new Response('<div id="root"></div>');
      if (url.endsWith('/rpc/ops_queues')) return new Response(JSON.stringify(q({ mentions_stuck: 3 })));
      if (url.endsWith('/auth/v1/health')) return new Response('{}');
      if (url.includes('/storage/v1/bucket/photos')) return new Response('nope', { status: 500 });
      if (url.endsWith('/rpc/ops_alerts_sync')) { const b = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ started: b.problems, still: [], cleared: [] })); }
      if (url.includes('resend')) { sent.push(JSON.parse(String(init!.body)).subject); return new Response('{}'); }
      return new Response('?', { status: 404 });
    }));
    const log = await healthPass(env, now);
    expect(sent).toEqual(['⚠️ ourfamily.example: 2 problems']);
    expect(log[0]).toContain('alert sent');
  });
  it('stays quiet when everything works', async () => {
    const f = vi.fn(async (url: string) => {
      if (url === 'https://ourfamily.example/') return new Response('<div id="root"></div>');
      if (url.endsWith('/rpc/ops_queues')) return new Response(JSON.stringify(q()));
      if (url.endsWith('/rpc/ops_alerts_sync')) return new Response(JSON.stringify({ started: [], still: [], cleared: [] }));
      if (url.includes('resend')) throw new Error('should not email');
      return new Response('{}');
    });
    vi.stubGlobal('fetch', f);
    expect(await healthPass(env, now)).toEqual([]);
  });
});
