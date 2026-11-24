#!/usr/bin/env node
// Checks site.config.json and copies its values into reminders/wrangler.toml.
//   npm run check
import { readFileSync, writeFileSync } from 'node:fs';
import { checkConfig, applyToWrangler } from './lib/config.mjs';

const cfgUrl = new URL('../site.config.json', import.meta.url);
const tomlUrl = new URL('../reminders/wrangler.toml', import.meta.url);
const cfg = JSON.parse(readFileSync(cfgUrl, 'utf8'));
const { ok, todo, blocking } = checkConfig(cfg);

writeFileSync(tomlUrl, applyToWrangler(readFileSync(tomlUrl, 'utf8'), cfg));

console.log('\nYour settings (site.config.json)\n');
ok.forEach((l) => console.log('  ✓ ' + l));
if (todo.length) { console.log('\nStill to do:'); todo.forEach((l) => console.log('  • ' + l)); }
console.log(`\nCopied the API address and sender into reminders/wrangler.toml.${todo.length ? '' : '\nAll set.'}\n`);
process.exit(blocking.length ? 1 : 0);
