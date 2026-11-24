/**
 * The family's own settings, from site.config.json at the top of the project (see docs/SETUP.md).
 */
import cfg from '../../site.config.json' with { type: 'json' };

const strip = (u: string) => u.replace(/\/+$/, '');

export const FAMILY: string = cfg.familyName;
export const SITE_URL: string = strip(cfg.siteUrl);
export const DOMAIN: string = new URL(SITE_URL).host;
export const API_URL: string = strip(cfg.apiUrl);
export const API_HOST: string = new URL(API_URL).host;
export const SITE_URLS: string[] = [SITE_URL, `https://www.${DOMAIN}`, ...cfg.otherSiteUrls.map(strip)];
export const EMAIL_FROM: string = cfg.emailFrom;
export const PRIVACY_EMAIL: string = cfg.privacyEmail;
const phone = cfg.admin.phone;
export const ADMIN = {
  short: cfg.admin.shortName,
  full: cfg.admin.name,
  phone,
  tel: phone.replace(/[^\d+]/g, ''),
  wa: (cfg.admin.whatsapp || phone).replace(/\D/g, ''),
  /** "Asha (Asha Raman)", or just the name when both are the same */
  who: cfg.admin.shortName === cfg.admin.name ? cfg.admin.name : `${cfg.admin.shortName} (${cfg.admin.name})`,
};
