import type { Locale } from "./i18n";

export function formatDate(iso: string | Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(iso: string | Date, locale: Locale): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * DEC-069: human-friendly "x ago" / "in x" relative time string.
 *
 * Picks the largest single unit that yields a value >= 1 and renders
 * a localized phrase. The reference point is `now` (defaults to
 * Date.now()) so callers can pin time for tests.
 *
 * Returns the absolute date via `formatAbsoluteDate` when the gap is
 * more than 30 days, so we never display "5 years ago" with no anchor.
 */
export function formatRelativeTime(
  iso: string | Date,
  locale: Locale,
  now: number = Date.now()
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = date.getTime() - now;
  const absDiffMs = Math.abs(diffMs);
  const future = diffMs > 0;

  // Past 30 days → absolute date instead of vague "x months ago".
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (absDiffMs > THIRTY_DAYS_MS) {
    return formatDate(date, locale);
  }

  const units: { ms: number; singular: { id: string; en: string }; plural: { id: string; en: string } }[] = [
    { ms: 60_000, singular: { id: "1 menit", en: "1 minute" }, plural: { id: "{n} menit", en: "{n} minutes" } },
    { ms: 3_600_000, singular: { id: "1 jam", en: "1 hour" }, plural: { id: "{n} jam", en: "{n} hours" } },
    { ms: 86_400_000, singular: { id: "1 hari", en: "1 day" }, plural: { id: "{n} hari", en: "{n} days" } },
  ];

  for (const u of units) {
    const n = Math.round(absDiffMs / u.ms);
    if (n >= 1) {
      const phrase = n === 1 ? u.singular : u.plural;
      const rendered = phrase[locale].replace("{n}", String(n));
      if (locale === "id") {
        return future ? `dalam ${rendered}` : `${rendered} yang lalu`;
      }
      return future ? `in ${rendered}` : `${rendered} ago`;
    }
  }

  // < 1 minute
  return locale === "id" ? "baru saja" : "just now";
}

/**
 * DEC-069: absolute date+time formatted as a tooltip-friendly anchor.
 * Same shape as `formatDateTime` but documented separately so callers
 * pairing `formatRelativeTime` + tooltip know exactly what to render.
 */
export function formatAbsoluteDate(iso: string | Date, locale: Locale): string {
  return formatDateTime(iso, locale);
}
