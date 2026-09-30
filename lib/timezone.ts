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

/** Inverse of localToUtcDate: given a UTC instant, returns its wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in `timeZone`. */
export function utcToLocalParts(
  date: Date,
  timeZone: string = BUSINESS_TIMEZONE
): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Pure calendar-day math on a "YYYY-MM-DD" string — deliberately not `new Date()` + local offsets. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Adds `months` calendar months to a "YYYY-MM-DD" string, clamping the day to the target month's last day (Jan 31 + 1 month -> Feb 28/29, not March 2/3). */
export function addMonthsToDateString(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const monthKey = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const clampedDay = Math.min(d, lastDayOfMonth(monthKey));
  return `${monthKey}-${String(clampedDay).padStart(2, "0")}`;
}

export type Recurrence = "daily" | "weekly" | "monthly";

/** Given the local date a recurring reminder just fired on, returns the local date of its next occurrence. */
export function nextRecurrenceDate(currentDateStr: string, recurrence: Recurrence): string {
  if (recurrence === "daily") return addDaysToDateString(currentDateStr, 1);
  if (recurrence === "weekly") return addDaysToDateString(currentDateStr, 7);
  return addMonthsToDateString(currentDateStr, 1);
}
