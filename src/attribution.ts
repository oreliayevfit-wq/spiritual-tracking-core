// Referrer hosts that count as a "real" traffic-source signal for last-touch
// purposes. Deliberately conservative — a miss here just means a legitimate ad
// referral gets treated as if it weren't one, which is safer than the reverse
// (treating direct/internal navigation as a fresh ad touch).
const AD_REFERRER_HOSTS = [
  "facebook.com",
  "l.facebook.com",
  "lm.facebook.com",
  "m.facebook.com",
  "instagram.com",
  "l.instagram.com",
  "google.com",
  "bing.com",
  "tiktok.com",
];

export function isKnownAdReferrer(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  return AD_REFERRER_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

export interface TouchSignal {
  utmSource?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}

// A session "counts" for last-touch purposes only if it carries a real
// campaign/ad signal. A direct or bookmarked repeat visit must not overwrite
// last-touch with "direct" — that would make last-touch degrade into
// "last pageview," which isn't useful attribution.
export function hasRealTouchSignal(signal: TouchSignal): boolean {
  return Boolean(signal.utmSource || signal.fbclid || isKnownAdReferrer(signal.referrer));
}
