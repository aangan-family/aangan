#!/usr/bin/env node
// Copies every file in the private "photos" bucket into a folder, for the encrypted backup (.github/workflows/backup.yml).
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Usage: node scripts/backup-photos.mjs <out-dir>
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY, out = process.argv[2];
if (!url || !key || !out) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY, and give an output folder.'); process.exit(1); }
// new secret keys (sb_secret_…) go only in apikey; the old service_role JWT in both
console.log(`server key: ${key.startsWith('sb_secret_') ? 'new secret key' : 'legacy service_role'}`);
const H = key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

async function list(prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/storage/v1/object/list/photos`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`list ${prefix || '/'}: ${r.status} ${await r.text()}`);
    const items = await r.json();
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) files.push(...await list(path)); // a folder
      else files.push(path);
    }
    if (items.length < 1000) return files;
  }
}

const files = await list('');
let bytes = 0;
for (const f of files) {
  const r = await fetch(`${url}/storage/v1/object/photos/${f.split('/').map(encodeURIComponent).join('/')}`, { headers: H });
  if (!r.ok) throw new Error(`download ${f}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  bytes += buf.length;
  await mkdir(dirname(join(out, f)), { recursive: true });
  await writeFile(join(out, f), buf);
}
console.log(`${files.length} photo files, ${(bytes / 1048576).toFixed(1)} MB`);
