/**
 * The family's own settings, from site.config.json at the top of the project.
 * Change them there (see docs/SETUP.md); nothing in this file needs editing.
 */
import cfg from '../../../site.config.json';

const strip = (u: string) => u.replace(/\/+$/, '');

export const FAMILY: string = cfg.familyName;
/** short name under the home-screen icon */
export const APP_NAME: string = cfg.appName;
export const STORY_HINT: string = cfg.familyStoryHint;
export const SITE_URL: string = strip(cfg.siteUrl);
/** the bare domain, e.g. "ourfamily.example" */
export const DOMAIN: string = new URL(SITE_URL).host;
export const API_URL: string = strip(cfg.apiUrl);
/** every address the site may be opened at: main, www. and any extra (e.g. the pages.dev address) */
export const SITE_URLS: string[] = [SITE_URL, `https://www.${DOMAIN}`, ...cfg.otherSiteUrls.map(strip)];
export const EMAIL_FROM: string = cfg.emailFrom;
export const PRIVACY_EMAIL: string = cfg.privacyEmail;
export const ADMIN = {
  name: cfg.admin.name,
  short: cfg.admin.shortName,
  phone: cfg.admin.phone,
  /** digits only, for wa.me links */
  wa: (cfg.admin.whatsapp || cfg.admin.phone).replace(/\D/g, ''),
  tel: cfg.admin.phone.replace(/[^\d+]/g, ''),
};
export const PUBLISHABLE_KEY: string = cfg.supabasePublishableKey;
export const GOOGLE_ID: string = cfg.googleClientId;
export const VAPID_KEY: string = cfg.vapidPublicKey;
export const COMMUNITY: string = cfg.community;
