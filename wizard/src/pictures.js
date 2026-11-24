// "Where to click" pictures for each account step: a simple drawn browser window with the menu item and the
// button to press highlighted. Drawn, not screenshots, so they never show anyone's account, and they stay readable
// when a dashboard changes its look. Pure data + one SVG builder; labels must match the words in steps.js.

const SVGNS = 'http://www.w3.org/2000/svg';

/** id → { url, brand, nav: [labels], on: index of the highlighted menu item, title, button, sub? } */
export const PICTURES = {
  github: { url: 'github.com/aangan-family/aangan', brand: '#24292f', nav: ['Code', 'Issues', 'Actions', 'Settings'], on: -1, title: 'aangan', button: 'Use this template', sub: 'Create a new repository' },
  domain: { url: 'dash.cloudflare.com', brand: '#f38020', nav: ['Account home', 'Domain Registration', 'Register Domains', 'Workers & Pages'], on: 2, title: 'Register Domains', button: 'Add a domain', sub: 'or search and register a new one' },
  supabase: { url: 'supabase.com/dashboard', brand: '#3ecf8e', nav: ['Table Editor', 'SQL Editor', 'Authentication', 'Project Settings'], on: 1, title: 'SQL Editor · New query', button: 'Run', code: true },
  google: { url: 'console.cloud.google.com', brand: '#1a73e8', nav: ['OAuth consent screen', 'Credentials', 'Library'], on: 1, title: 'APIs & Services · Credentials', button: '+ Create credentials', sub: 'OAuth client ID' },
  worker: { url: 'dash.cloudflare.com', brand: '#f38020', nav: ['Account home', 'Domains', 'Workers & Pages', 'Email Routing'], on: 2, title: 'Workers & Pages', button: 'Create', sub: 'Worker' },
  pages: { url: 'dash.cloudflare.com', brand: '#f38020', nav: ['Account home', 'Domains', 'Workers & Pages', 'Email Routing'], on: 2, title: 'Workers & Pages · Pages', button: 'Connect to Git' },
  email: { url: 'resend.com', brand: '#111111', nav: ['Emails', 'Domains', 'API Keys', 'Settings'], on: 1, title: 'Domains', button: '+ Add domain' },
  signin: { url: '%SITE%', brand: '#c84a22', nav: [], title: 'Sign in', button: 'Continue with Google', sub: 'or enter your Gmail and open the link in the email' },
  family: { url: '%SITE%/#/admin', brand: '#c84a22', nav: ['Home', 'Family tree', 'Talk', 'Admin'], on: 3, title: 'Admin · Members & roles', button: 'Members & roles', sub: 'choose Steward for one or two people per branch' },
  extras: { url: 'github.com/…/settings/secrets/actions', brand: '#24292f', nav: ['General', 'Secrets and variables', 'Actions', 'Pages'], on: 1, title: 'Actions secrets', button: 'New repository secret', sub: 'add SUPABASE_DB_URL, SUPABASE_SERVICE_KEY, BACKUP_PASSPHRASE' },
  keys: { url: 'github.com/…/settings/secrets/actions', brand: '#24292f', nav: ['General', 'Secrets and variables', 'Actions', 'Pages'], on: 1, title: 'Actions secrets', button: 'New repository secret', sub: 'Name · Secret · Add secret' },
  run: { url: 'github.com/…/actions', brand: '#24292f', nav: ['All workflows', 'Set up my site', 'Deploy my site', 'backup'], on: 1, title: 'Set up my site', button: 'Run workflow', sub: 'Run workflow (green)' },
  load: { url: 'supabase.com/dashboard', brand: '#3ecf8e', nav: ['Table Editor', 'SQL Editor', 'Authentication', 'Project Settings'], on: 1, title: 'SQL Editor · New query', button: 'Run', code: true },
};

const el = (name, attrs = {}, ...kids) => {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) n.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
};

/** The picture for a step, or null. siteHost fills in the family's own address. */
export function picture(id, siteHost = 'yourfamily.in') {
  const p = PICTURES[id];
  if (!p) return null;
  const W = 520, H = 250, side = p.nav.length ? 140 : 0;
  const url = p.url.replace('%SITE%', siteHost);
  const hi = '#de5c2a';
  const g = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'pic', 'aria-label': `Picture: on ${url}${p.nav.length ? `, open ${p.nav[p.on]}` : ''}, then press ${p.button}${p.sub ? `, then ${p.sub}` : ''}.` });
  // window
  g.append(el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 12, fill: '#fff', stroke: '#e7d9c4' }));
  g.append(el('rect', { x: 1, y: 1, width: W - 2, height: 30, rx: 12, fill: '#f7efe2' }), el('rect', { x: 1, y: 20, width: W - 2, height: 11, fill: '#f7efe2' }));
  ['#e8776b', '#f2c14e', '#7ac27a'].forEach((c, i) => g.append(el('circle', { cx: 16 + i * 14, cy: 16, r: 4.5, fill: c })));
  g.append(el('rect', { x: 64, y: 8, width: W - 80, height: 16, rx: 8, fill: '#fff', stroke: '#eadfcd' }));
  g.append(el('text', { x: 74, y: 20, 'font-size': 10, fill: '#6b5a48' }, '🔒 ' + url));
  // menu
  if (side) {
    g.append(el('rect', { x: 1, y: 31, width: side, height: H - 32, fill: '#fbf7f0' }));
    g.append(el('rect', { x: 12, y: 42, width: 22, height: 6, rx: 3, fill: p.brand }));
    p.nav.forEach((label, i) => {
      const y = 62 + i * 30, on = i === p.on;
      if (on) g.append(el('rect', { x: 8, y: y - 14, width: side - 14, height: 22, rx: 6, fill: '#fde6d8', stroke: hi, 'stroke-width': 2 }));
      g.append(el('text', { x: 16, y: y + 1, 'font-size': 11, fill: on ? '#8e1f22' : '#6b5a48', 'font-weight': on ? 700 : 400 }, label));
      if (on) g.append(el('text', { x: side - 22, y: y + 1, 'font-size': 11, fill: hi, 'font-weight': 700 }, '1'));
    });
  }
  // page
  const x0 = side + 22;
  g.append(el('text', { x: x0, y: 60, 'font-size': 14, 'font-weight': 700, fill: '#2b2118' }, p.title));
  if (p.code) {
    g.append(el('rect', { x: x0, y: 74, width: W - x0 - 22, height: 92, rx: 8, fill: '#1f2430' }));
    ['-- paste the file here', 'create table …', 'insert into …'].forEach((t, i) => g.append(el('text', { x: x0 + 12, y: 96 + i * 18, 'font-size': 10, fill: i ? '#a9d6ff' : '#7f8a99', 'font-family': 'ui-monospace, monospace' }, t)));
  } else {
    [0, 1, 2].forEach((i) => g.append(el('rect', { x: x0, y: 78 + i * 16, width: (W - x0 - 40) * (1 - i * 0.22), height: 7, rx: 3.5, fill: '#efe6d8' })));
  }
  // the button
  const bw = Math.max(96, p.button.length * 7.4 + 28), bx = p.code ? W - 52 - bw : x0, by = p.code ? 180 : 140;
  g.append(el('rect', { x: bx - 5, y: by - 5, width: bw + 10, height: 40, rx: 12, fill: 'none', stroke: hi, 'stroke-width': 2.5, 'stroke-dasharray': '5 4' }));
  g.append(el('rect', { x: bx, y: by, width: bw, height: 30, rx: 8, fill: p.brand }));
  g.append(el('text', { x: bx + bw / 2, y: by + 19.5, 'font-size': 12, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle' }, p.button));
  const step = side && p.on >= 0 ? '2' : '1';
  g.append(el('circle', { cx: bx + bw + 18, cy: by + 15, r: 10, fill: hi }), el('text', { x: bx + bw + 18, y: by + 19, 'font-size': 11, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle' }, step));
  if (p.sub) g.append(el('text', { x: bx, y: by + 52, 'font-size': 11, fill: '#6b5a48' }, `then: ${p.sub}`));
  return g;
}
