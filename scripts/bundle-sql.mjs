#!/usr/bin/env node
// Joins every file in supabase/migrations/ into one file, supabase/setup.sql, so a new family can set up
// the whole database with a single paste into the Supabase SQL editor.   npm run sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
// each step in its own transaction: a later step may use what an earlier one added (e.g. a new role name)
const parts = files.map((f) => `-- ===================================================== ${f}\nbegin;\n${readFileSync(new URL(f, dir), 'utf8').trim()}\ncommit;\n`);
writeFileSync(new URL('../supabase/setup.sql', import.meta.url),
  `-- The whole family website database: privacy rules, tables and functions (${files.length} steps).\n` +
  `-- Paste all of this into Supabase → SQL Editor → New query, and press Run. Run it once, on a new project.\n` +
  `-- Made by: npm run sql (from supabase/migrations/). Don't edit this file; edit the migrations.\n\n` + parts.join('\n'));
console.log(`wrote supabase/setup.sql (${files.length} migrations)`);
