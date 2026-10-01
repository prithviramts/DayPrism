// Dates and times, the way DayPrism stores them.
//
// Entries keep the local wall-clock time you saw on your phone ("2026-10-01T13:05:00", no zone),
// plus the UTC offset in effect at that moment. Local strings sort and range-filter correctly as
// plain text in SQLite, and "show me 3 Oct" is the query we run most. The offset keeps the exact
// instant recoverable if you travel.
//
// LocalDateTime = "YYYY-MM-DDTHH:mm:ss", DateOnly = "YYYY-MM-DD". Both are plain strings.

import { getCalendars } from 'expo-localization';

export type LocalDateTime = string;
export type DateOnly = string;

const pad = (n: number) => String(n).padStart(2, '0');

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Device-local Date → "YYYY-MM-DDTHH:mm:ss". */
export function toLocal(d: Date): LocalDateTime {
  return `${toDateOnly(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function toDateOnly(d: Date): DateOnly {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a LocalDateTime or DateOnly as a device-local Date. */
export function fromLocal(s: string): Date {
  const [datePart, timePart = '00:00:00'] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export const nowLocal = (): LocalDateTime => toLocal(new Date());
export const today = (): DateOnly => toDateOnly(new Date());

/** The calendar date part of a local time. */
export const dateOf = (t: LocalDateTime): DateOnly => t.slice(0, 10);

/** "HH:mm" part of a local time. */
export const hhmm = (t: LocalDateTime): string => t.slice(11, 16);

/** Midnight at the start of a date. */
export const startOf = (d: DateOnly): LocalDateTime => `${d}T00:00:00`;

/** A local time on a date, from a fractional hour (25.5 = 01:30 the next day). Rounded to the minute. */
export function at(d: DateOnly, hour: number): LocalDateTime {
  const base = fromLocal(d);
  base.setMinutes(Math.round(hour * 60));
  return toLocal(base);
}

/** Joins a date and a "HH:mm" clock time. */
export const combine = (d: DateOnly, clock: string): LocalDateTime => `${d}T${clock.slice(0, 5)}:00`;

export function addDays(d: DateOnly, days: number): DateOnly {
  const x = fromLocal(d);
  x.setDate(x.getDate() + days);
  return toDateOnly(x);
}

export function addMonths(d: DateOnly, months: number): DateOnly {
  const x = fromLocal(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + months);
  return toDateOnly(x);
}

export function addMinutes(t: LocalDateTime, minutes: number): LocalDateTime {
  const x = fromLocal(t);
  x.setMinutes(x.getMinutes() + minutes);
  return toLocal(x);
}

/** Whole days since 1970-01-01, independent of time zone and DST. */
export function dayNumber(d: DateOnly): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

export const daysBetween = (from: DateOnly, to: DateOnly) => dayNumber(to) - dayNumber(from);

/** Hours from a to b, using wall-clock arithmetic (DST changes don't add or lose an hour). */
export function hoursBetween(a: LocalDateTime, b: LocalDateTime): number {
  const ms = (s: string) => {
    const [datePart, timePart] = s.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm, ss = 0] = (timePart ?? '00:00:00').split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh, mm, ss);
  };
  return (ms(b) - ms(a)) / 3_600_000;
}

/** Fractional hour of the day, e.g. 13:30 → 13.5. */
export function hourOfDay(t: LocalDateTime): number {
  const [hh, mm, ss = 0] = t.slice(11).split(':').map(Number);
  return hh + mm / 60 + ss / 3600;
}

/** 0 = Sunday … 6 = Saturday. */
export const dayOfWeek = (d: DateOnly) => fromLocal(d).getDay();

/** Monday on or before the date. */
export const mondayOf = (d: DateOnly) => addDays(d, -((dayOfWeek(d) + 6) % 7));

/** Mon–Fri work week. */
export const isWorkday = (d: DateOnly) => dayOfWeek(d) !== 0 && dayOfWeek(d) !== 6;

/** Minutes east of UTC at a local time, e.g. 240 for Dubai. Follows the phone's time zone. */
export const offsetAt = (t: LocalDateTime) => -fromLocal(t).getTimezoneOffset();

/** The local time with its UTC offset, e.g. "2026-10-01T13:05:00+04:00". */
export function withOffset(t: LocalDateTime, offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${t}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The device's IANA time zone, e.g. "Asia/Dubai". */
export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}

/**
 * Small date formatter covering the patterns the app uses:
 * ddd (Mon), dddd (Monday), d, dd, MMM (Oct), MMMM (October), yyyy.
 */
export function fmtDate(d: DateOnly, pattern: string): string {
  const x = fromLocal(d);
  return pattern.replace(/dddd|ddd|dd|d|MMMM|MMM|yyyy/g, (token) => {
    switch (token) {
      case 'dddd': return DAYS_LONG[x.getDay()];
      case 'ddd': return DAYS_SHORT[x.getDay()];
      case 'dd': return pad(x.getDate());
      case 'd': return String(x.getDate());
      case 'MMMM': return MONTHS_LONG[x.getMonth()];
      case 'MMM': return MONTHS_SHORT[x.getMonth()];
      case 'yyyy': return String(x.getFullYear());
      default: return token;
    }
  });
}

/** 6.98 → "6h 59m", 0.75 → "45m". */
export function duration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

/** "HH:mm" from a fractional hour that may run past midnight (25.5 → "01:30"). */
export function clockFromHour(hour: number): string {
  const minutes = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export const minLocal = (a: LocalDateTime, b: LocalDateTime) => (a < b ? a : b);
export const maxLocal = (a: LocalDateTime, b: LocalDateTime) => (a > b ? a : b);

/** Days from `from` to `to`, inclusive. */
export function dateRange(from: DateOnly, to: DateOnly): DateOnly[] {
  const days: DateOnly[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

// ---------------------------------------------------------------- locale-aware display
// Times are *stored* as 24-hour "HH:mm" everywhere; these only affect how they're *shown*,
// following the phone's own settings (12-hour "6:45 PM" in the US, "18:45" in most places).

function phoneCalendar() {
  try {
    return getCalendars()[0];
  } catch {
    return undefined;
  }
}

/** True when the phone shows a 24-hour clock. */
export const uses24h: boolean = phoneCalendar()?.uses24hourClock ?? true;

/** First day of the week on this phone: 0 = Sunday, 1 = Monday, … (expo-localization uses 1 = Sunday). */
export const firstWeekday: number = ((phoneCalendar()?.firstWeekday ?? 2) + 6) % 7;

/** "18:45" → "18:45" or "6:45 PM", per the phone's clock setting. Accepts "HH:mm" or a LocalDateTime. */
export function showTime(t: string): string {
  const clock = t.length > 5 ? t.slice(11, 16) : t;
  if (uses24h) return clock;
  const [h, m] = clock.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Hour label for chart axes: "08" or "8a". */
export function showHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  return uses24h ? String(hour).padStart(2, '0') : `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
}
