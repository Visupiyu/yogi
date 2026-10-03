// The production identity of the site, in ONE place. Dependency-free so pages,
// server routes, emails and tests can all import it.
//
// Canonical domain: the APEX https://yomico.in — the value metadataBase,
// canonical URLs, the sitemap, robots.txt and JSON-LD have always used. Any
// www.yomico.in traffic is expected to redirect to the apex at the hosting
// layer (Vercel → Domains); that redirect is configured outside this
// repository (see README → "Domain").
export const SITE_HOST = "yomico.in";
export const SITE_URL = `https://${SITE_HOST}`;

/** The monitored support inbox (contact-form submissions are delivered here). */
export const SUPPORT_EMAIL = "yomico.help@gmail.com";

/** Sender for every transactional email (the verified yomico.in domain in Resend). */
export const EMAIL_FROM = `YOMICO <noreply@${SITE_HOST}>`;

// Support availability — what the business actually offers. The contact flow
// is staffed Monday–Saturday and replies within 24–48 business hours; there is
// no 24/7 staffed support, so no surface may claim one.
export const SUPPORT_HOURS_SHORT = "Mon–Sat support";
export const SUPPORT_RESPONSE_TEXT = "We reply within 24–48 business hours (Monday–Saturday).";

/** Absolute URL on the canonical domain for a site path. */
export function siteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
