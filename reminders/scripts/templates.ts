// Writes the Supabase sign-in email templates: npm run templates
import { writeFileSync } from 'node:fs';
import { confirmSignup, CONFIRM_SUBJECT, magicLink, MAGIC_SUBJECT } from '../src/auth-templates.ts';
const dir = new URL('../../supabase/templates/', import.meta.url);
writeFileSync(new URL('confirm-signup.html', dir), confirmSignup());
writeFileSync(new URL('magic-link.html', dir), magicLink());
writeFileSync(new URL('subjects.txt', dir), `Confirm signup: ${CONFIRM_SUBJECT}\nMagic Link: ${MAGIC_SUBJECT}\n`);
console.log('wrote supabase/templates/');
