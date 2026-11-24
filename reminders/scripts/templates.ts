// Writes the Supabase sign-in email templates: npm run templates
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { confirmSignup, CONFIRM_SUBJECT, magicLink, MAGIC_SUBJECT } from '../src/auth-templates.ts';
// run from reminders/ (npm run templates bundles this file first, so import.meta.url isn't reliable)
const dir = new URL('../supabase/templates/', pathToFileURL(process.cwd() + '/'));
writeFileSync(new URL('confirm-signup.html', dir), confirmSignup());
writeFileSync(new URL('magic-link.html', dir), magicLink());
writeFileSync(new URL('subjects.txt', dir), `Confirm signup: ${CONFIRM_SUBJECT}\nMagic Link: ${MAGIC_SUBJECT}\n`);
console.log('wrote supabase/templates/');
