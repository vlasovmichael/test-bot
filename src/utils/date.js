import { DateTime } from "luxon";

/**
 * Standardize all internal time to UTC, but display/capture time based on the Tenant's local timezone.
 */

export function toUTC(dateStr, timeStr, timezone) {
  return DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone: timezone }).toUTC().toISO();
}

export function fromUTC(isoStr, timezone) {
  return DateTime.fromISO(isoStr).setZone(timezone);
}

export function formatInTimezone(isoStr, timezone, format = DateTime.DATETIME_MED) {
  return fromUTC(isoStr, timezone).toLocaleString(format);
}

export function getLocalNow(timezone) {
  return DateTime.now().setZone(timezone);
}

// Keep these for backward compatibility during refactor if needed
export function formatWarsawDate(dateStr) {
  return DateTime.fromISO(dateStr).setZone("Europe/Warsaw").toLocaleString(DateTime.DATE_MED);
}

export function formatWarsawTime(dateStr) {
  return DateTime.fromISO(dateStr).setZone("Europe/Warsaw").toLocaleString(DateTime.TIME_SIMPLE);
}
