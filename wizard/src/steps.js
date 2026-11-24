// The account walkthrough, filled in with the family's own settings. Pure (no DOM), so it can be tested.
// Keep in step with docs/SETUP.md and docs/HOSTING.md.

const host = (u) => { try { return new URL(u).host; } catch { return ''; } };

/**
 * cfg: the settings being written. Returns [{ id, site, title, why, items }].
 * An item is a string (an instruction) or { text, copy } (an instruction with a value to copy)
 * or { text, go } (an instruction that sends you to another wizard step).
 */
export function accountSteps(cfg) {
  const free = host(cfg.siteUrl).endsWith('.pages.dev');
  const domain = host(cfg.siteUrl) || 'yourdomain';
  const api = host(cfg.apiUrl) || (free ? 'your Worker\'s workers.dev address' : `api.${domain}`);
  const site = cfg.siteUrl || 'https://' + domain;
  const steps = [];

  steps.push({
    id: 'github', site: 'GitHub', title: 'Make your own private copy',
    why: 'Your copy holds your settings and runs the nightly backups.',
    items: [
      'Sign in at github.com (make a free account if you need one).',
      'Open github.com/aangan-family/aangan and press Use this template → Create a new repository.',
      'Name it (for example sharma-family) and choose Private. It must be private.',
      { text: 'When your settings are ready, download them from the Settings step.', go: 'settings' },
      'In your new repository, open site.config.json → the pencil (Edit) button → paste your settings over everything → Commit changes.',
      'Do the same for reminders/wrangler.toml with the second file from the Settings step.',
    ],
  });

  if (!free) steps.push({
    id: 'domain', site: 'Cloudflare', title: 'Get your domain',
    why: 'Your family\'s own address, and the sender of the family\'s emails.',
    items: [
      'Sign up at cloudflare.com.',
      'Domain Registration → Register Domains, or Add a domain if you bought it elsewhere (Cloudflare doesn\'t sell .in: buy those from an Indian registrar, then add them here).',
      { text: 'Your domain', copy: domain },
    ],
  });

  steps.push({
    id: 'supabase', site: 'Supabase', title: 'Create the database',
    why: 'Where the tree and every privacy rule live. Only your family\'s copy ever holds your data.',
    items: [
      'Sign up at supabase.com → New project. Region: Mumbai (or nearest your family). Save the database password somewhere safe.',
      { text: 'Download the database setup (one file).', go: 'database' },
      'SQL Editor → New query → open setup.sql, copy everything, paste, press Run. Run it only once.',
      { text: 'Make your family\'s data file in the Database step, then paste it into a new query and press Run.', go: 'database' },
      'Project Settings → Data API: copy the Project URL. Project Settings → API Keys: copy the publishable key (sb_publishable_…).',
      { text: 'Paste both into the Settings step.', go: 'settings' },
      'Also copy the secret key (sb_secret_…), but never put it in any file: it goes only into the Worker in the next step.',
    ],
  });

  steps.push({
    id: 'google', site: 'Google Cloud', title: free ? 'Turn on Continue with Google (needed)' : 'Turn on Continue with Google (recommended)',
    why: free ? 'On the free setup this is the only way to sign in.' : 'Most relatives find it easiest.',
    items: [
      'console.cloud.google.com → create a project → APIs & Services → OAuth consent screen: External, your family\'s name, your Gmail.',
      'Credentials → Create credentials → OAuth client ID → Web application.',
      { text: 'Authorised JavaScript origin', copy: site },
      { text: 'Authorised redirect URI', copy: `https://${api}/oauth/google/callback` },
      { text: 'Copy the client ID into the Settings step (googleClientId).', go: 'settings' },
      'Supabase → Authentication → Sign In / Providers → Google: turn on, paste the client ID and client secret.',
      'Keep the client secret for the Worker (GOOGLE_CLIENT_SECRET).',
    ],
  });

  steps.push({
    id: 'worker', site: 'Cloudflare', title: 'Put the helper service online',
    why: 'It connects the website to the database (some Indian providers block Supabase\'s address) and sends emails and reminders.',
    items: [
      'Workers & Pages → Create → Import a repository → your repository. Root directory: reminders. Deploy.',
      'The Worker → Settings → Variables and Secrets → add these as Secrets:',
      { text: 'SUPABASE_SERVICE_KEY', copy: 'SUPABASE_SERVICE_KEY' },
      'its value: the secret key from Supabase (sb_secret_…)',
      { text: 'REMINDER_EMAIL (daily reminders and health alerts come here)', copy: 'REMINDER_EMAIL' },
      { text: 'PREVIEW_KEY: a long password you make up', copy: 'PREVIEW_KEY' },
      { text: 'GOOGLE_CLIENT_SECRET (from Google Cloud)', copy: 'GOOGLE_CLIENT_SECRET' },
      ...(free
        ? [{ text: 'Copy the Worker\'s address (…workers.dev) into the Settings step as the API address.', go: 'settings' }]
        : [{ text: 'Your API address is attached automatically', copy: api }]),
      'Wait 10 minutes: the Worker introduces itself to the database on its first run.',
    ],
  });

  steps.push({
    id: 'pages', site: 'Cloudflare', title: 'Put the website online',
    why: 'Every time your repository changes, the site rebuilds itself (after its tests pass).',
    items: [
      'Workers & Pages → Create → Pages → Connect to Git → your repository.',
      { text: 'Build command', copy: 'cd web && npm ci && npm run build' },
      { text: 'Output directory', copy: 'web/dist' },
      free ? { text: 'Project name (your address will be this .pages.dev)', copy: domain.replace(/\.pages\.dev$/, '') } : { text: 'Custom domains → Set up a custom domain', copy: domain },
    ],
  });

  if (!free) steps.push({
    id: 'email', site: 'Resend + Supabase', title: 'Emails',
    why: 'Sign-in links, welcome emails and the weekly family email.',
    items: [
      'resend.com → Domains → Add domain → your domain. Let Resend add the records to Cloudflare. Wait for Verified.',
      'API Keys → Create. Add it to the Worker as the secret RESEND_API_KEY.',
      'Supabase → Authentication → Emails → SMTP Settings: turn on custom SMTP.',
      { text: 'Host', copy: 'smtp.resend.com' },
      { text: 'Port', copy: '465' },
      { text: 'Username', copy: 'resend' },
      'Password: the Resend API key.',
      { text: 'Sender', copy: cfg.emailFrom || `family@${domain}` },
      { text: 'Authentication → URL Configuration → Site URL', copy: site },
      'Sign-in email templates in your family\'s name: in a Codespace run cd reminders && npm install && npm run templates, then paste supabase/templates/ into Authentication → Emails → Templates.',
      'Cloudflare → your domain → Email → Email Routing: forward family@ and privacy@ to your Gmail.',
    ],
  });

  steps.push({
    id: 'signin', site: 'Your website', title: 'Sign in as the admin',
    why: 'You were invited as admin by your family\'s data file.',
    items: [
      { text: 'Open your website', copy: site },
      free ? 'Press Continue with Google with the Gmail you gave in the Database step.' : 'Enter the Gmail you gave in the Database step, and open the link in the email.',
      'Read and accept the privacy agreement.',
      'Within 7 days, turn on 2-step sign-in (My privacy). Admins see everyone\'s details, so this is required.',
    ],
  });

  steps.push({
    id: 'family', site: 'Your website', title: 'Bring the family in',
    why: 'Start with one or two people per branch.',
    items: [
      'Make one or two relatives from each branch stewards (Admin → Members & roles). They add relatives and approve who joins.',
      { text: 'Share this link in the family WhatsApp groups', copy: `${site}/#/join` },
      'For elders: open their profile → Set this up for… makes a QR code with large text.',
    ],
  });

  steps.push({
    id: 'extras', site: 'Optional', title: 'Backups and phone notifications',
    why: 'Worth doing in the first week.',
    items: [
      'Backups: your repository → Settings → Secrets and variables → Actions → add SUPABASE_DB_URL (Supabase → Connect → Session pooler), SUPABASE_SERVICE_KEY and BACKUP_PASSPHRASE (write it down offline).',
      'Phone notifications: in a Codespace run npx web-push generate-vapid-keys. Public key → Settings step (vapidPublicKey); private key → Worker secret VAPID_PRIVATE.',
    ],
  });
  return steps;
}

/** The one-click path: make the accounts, copy their keys into GitHub once, press Run workflow (docs/SETUP.md "One-click setup"). */
export function oneClickSteps(cfg) {
  const hand = accountSteps(cfg);
  const by = (id) => hand.find((s) => s.id === id);
  const free = host(cfg.siteUrl).endsWith('.pages.dev');
  const steps = [{ ...by('github'), items: by('github').items.filter((i) => !(typeof i === 'string' && i.includes('wrangler.toml'))) }];   // the setup writes wrangler.toml itself
  if (!free) steps.push(by('domain'));
  steps.push({
    id: 'keys', site: 'Supabase, Cloudflare' + (free ? '' : ', Resend') + ' → GitHub', title: 'Make the accounts and copy their keys',
    why: 'Copied once into your private copy\'s secrets. Only the setup button and the deploys can read them.',
    items: [
      'In your GitHub copy: Settings → Secrets and variables → Actions → New repository secret, once for each line below.',
      { text: 'Name', copy: 'SUPABASE_ACCESS_TOKEN' }, 'Value: supabase.com (sign up free) → your avatar → Account preferences → Access Tokens → Generate new token.',
      { text: 'Name', copy: 'CLOUDFLARE_API_TOKEN' }, 'Value: Cloudflare → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers", then + Add more: Account · Cloudflare Pages · Edit; Account · Workers AI · Read; Account · Email Routing Addresses · Edit; Zone · DNS · Edit; Zone · Email Routing Rules · Edit.',
      { text: 'Name', copy: 'CLOUDFLARE_ACCOUNT_ID' }, 'Value: Cloudflare → Workers & Pages → Account ID (right-hand side).',
      { text: 'Name', copy: 'REMINDER_EMAIL' }, 'Value: your Gmail.',
      ...(free ? [] : [{ text: 'Name', copy: 'RESEND_API_KEY' }, 'Value: resend.com (sign up free) → API Keys → Create → Full access.']),
    ],
  });
  steps.push({ ...by('google'), title: free ? 'Continue with Google (needed; can be after the first run)' : 'Continue with Google (recommended; can be later)', items: [...by('google').items.filter((i) => !(typeof i === 'string' && /^(Supabase|Keep)/.test(i))), 'Add the client ID and secret as the secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then run the setup again.'] });
  steps.push({
    id: 'run', site: 'GitHub', title: 'Press the setup button',
    why: 'Creates the database, the helper service, the website' + (free ? '' : ', the emails and email forwarding') + '. 10–20 minutes. Safe to run again.',
    items: [
      'In your copy: Actions → Set up my site → Run workflow → Run workflow.',
      'When it finishes, open the run: its summary lists what was done and what\'s left.',
      'Stopped with a message? Fix what it says and press Run workflow again: it carries on from where it stopped.',
      ...(free ? [] : ['Open the email from Cloudflare (to your Gmail) and confirm forwarding.']),
    ],
  });
  steps.push({
    id: 'load', site: 'Supabase', title: 'Load your family',
    why: 'Your tree goes straight from this computer to your database, never through GitHub.',
    items: [
      { text: 'Download seed.sql in the Database step.', go: 'database' },
      'Supabase → your project → SQL Editor → New query → paste everything → Run. Then delete the file.',
    ],
  });
  steps.push(by('signin'), by('family'), { ...by('extras'), title: 'Backups', items: by('extras').items.filter((i) => /^Backups/.test(i)) });
  return steps;
}
