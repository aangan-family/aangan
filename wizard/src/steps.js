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
