import { ConfigurationError } from './errors';

export const DEFAULT_TIMEZONE = 'UTC';

export function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new ConfigurationError(`Invalid IANA timezone identifier: "${timezone}". Use a value like "Europe/Amsterdam" or "UTC".`);
  }
}

export function unixToUtcIso(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds === null || unixSeconds === undefined) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export function utcIsoToTimezone(utcIso: string | null, timezone: string): string | null {
  if (!utcIso) return null;
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return null;
  if (timezone === DEFAULT_TIMEZONE) return utcIso;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function unixToTimezone(unixSeconds: number | null | undefined, timezone: string): {
  utc: string | null;
  local: string | null;
  timezone: string;
} {
  const utc = unixToUtcIso(unixSeconds);
  const local = utcIsoToTimezone(utc, timezone);
  return { utc, local, timezone };
}

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function nowInTimezone(timezone: string): string {
  return utcIsoToTimezone(nowUtcIso(), timezone) ?? nowUtcIso();
}

export function addDaysUtcIso(fromUtcIso: string, days: number): string {
  const date = new Date(fromUtcIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
