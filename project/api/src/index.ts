// Pass-through to the aangan Edge Function. Only the paths the site uses, only POST/OPTIONS, small bodies.
// The function itself checks origins, input and the admin password; this adds the visitor's address for rate limits.
interface Env { FUNCTION_URL: string }
const PATHS = new Set(['/view', '/signup', '/step', '/forget', '/admin/claim', '/admin/stats']);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!PATHS.has(url.pathname) || !['POST', 'OPTIONS'].includes(req.method)) return new Response('Not found', { status: 404 });
    const body = req.method === 'POST' ? await req.text() : undefined;
    if (body && body.length > 4000) return new Response('Too large', { status: 413 });
    const headers = new Headers();
    for (const h of ['content-type', 'origin', 'access-control-request-method', 'access-control-request-headers']) {
      const v = req.headers.get(h); if (v) headers.set(h, v);
    }
    headers.set('x-forwarded-for', req.headers.get('cf-connecting-ip') || '');
    const res = await fetch(env.FUNCTION_URL + url.pathname, { method: req.method, headers, body });
    return new Response(res.body, { status: res.status, headers: res.headers });
  },
};
