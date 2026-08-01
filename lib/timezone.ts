// Business is fixed in Denver, so reminders/scheduling always resolve
// against this timezone rather than trying to detect the caller's.
export const BUSINESS_TIMEZONE = "America/Denver";

/** Offset (ms) to add to a UTC-parsed instant to get the true UTC instant for that wall-clock time in `timeZone`. */
function tzOffsetMs(utcGuess: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcGuess).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - utcGuess.getTime();
}

/**
 * Converts a local wall-clock date+time in `timeZone` (default Denver) to
 * the correct UTC instant, handling DST correctly. E.g. "2026-08-05" +
 * "18:00" in America/Denver -> the right UTC timestamp whether that date
 * falls in MDT or MST.
 */
export function localToUtcDate(
  dateStr: string,
  timeStr: string,
  timeZone: string = BUSINESS_TIMEZONE
): Date {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

/** Current date/time formatted for injection into the system prompt, so Claude never has to guess "today". */
export function nowInBusinessTimezoneLabel(): string {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  return `${formatted} (${BUSINESS_TIMEZONE})`;
}

export function todayInBusinessTimezone(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Last calendar day number of a "YYYY-MM" month (e.g. 31 for "2026-08"). Pure calendar math, no server-timezone dependency. */
export function lastDayOfMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
