const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(value: Date | string, timeZone: string): ZonedParts | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute, second };
}

function two(value: number): string { return String(value).padStart(2, "0"); }

export function zonedDateKey(value: Date | string, timeZone: string): string {
  const parts = zonedParts(value, timeZone);
  return parts ? `${parts.year}-${two(parts.month)}-${two(parts.day)}` : "";
}

export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function calendarDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, Math.max(0, (month || 1) - 1), day || 1, 12, 0, 0, 0);
}

export function currentCalendarDate(timeZone: string): Date {
  return calendarDateFromKey(zonedDateKey(new Date(), timeZone));
}

export function zonedDateTimeInput(value: Date | string, timeZone: string): string {
  const parts = zonedParts(value, timeZone);
  return parts ? `${parts.year}-${two(parts.month)}-${two(parts.day)}T${two(parts.hour)}:${two(parts.minute)}` : "";
}

function timezoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  if (!parts) return 0;
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const actualToSecond = Math.floor(date.getTime() / 1000) * 1000;
  return representedAsUtc - actualToSecond;
}

export function zonedLocalInputToDate(value: string, timeZone: string): Date | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(naiveUtc);
  for (let index = 0; index < 4; index += 1) {
    const next = new Date(naiveUtc - timezoneOffsetMilliseconds(candidate, timeZone));
    if (Math.abs(next.getTime() - candidate.getTime()) < 1000) { candidate = next; break; }
    candidate = next;
  }
  const resolved = zonedParts(candidate, timeZone);
  if (!resolved || resolved.year !== year || resolved.month !== month || resolved.day !== day || resolved.hour !== hour || resolved.minute !== minute) return null;
  return candidate;
}

export function zonedLocalInputToIso(value: string, timeZone: string): string | undefined {
  return zonedLocalInputToDate(value, timeZone)?.toISOString();
}

export function addMinutesToLocalInput(value: string, minutes: number): string {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return value;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText), Number(minuteText) + minutes));
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}T${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`;
}

export function zonedStartOfCalendarDate(date: Date, timeZone: string): Date {
  return zonedLocalInputToDate(`${calendarDateKey(date)}T00:00`, timeZone) ?? new Date(date);
}

export function formatInTimeZone(value: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: safeTimeZone(timeZone) }).format(date);
}
