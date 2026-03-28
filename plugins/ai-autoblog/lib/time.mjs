const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_MAP = new Map([
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
]);

const partsFormatterCache = new Map();
const offsetFormatterCache = new Map();

export const SCHEDULE_MODES = ['daily', 'weekdays', 'weekly'];
export const IMAGE_ASPECT_RATIOS = ['1:1', '3:2', '4:3', '4:5', '16:9', '9:16'];

export function normalizeScheduleMode(input) {
  const value = String(input ?? '').trim().toLowerCase();
  return SCHEDULE_MODES.includes(value) ? value : 'daily';
}

export function normalizeWeekday(input) {
  const value = Number.parseInt(String(input ?? '').trim(), 10);
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    return 1;
  }

  return value;
}

export function normalizeScheduleTime(input) {
  const value = String(input ?? '').trim();
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return '09:00';
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) {
    return '09:00';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizeOptionalDate(input) {
  const value = String(input ?? '').trim();
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Start date must use YYYY-MM-DD.');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Start date is invalid.');
  }

  return value;
}

export function normalizeAspectRatio(input) {
  const value = String(input ?? '').trim();
  return IMAGE_ASPECT_RATIOS.includes(value) ? value : '16:9';
}

export function computeNextRunAt({
  now = new Date(),
  timeZone = 'UTC',
  scheduleMode = 'daily',
  scheduleTime = '09:00',
  scheduleWeekday = 1,
  startDate = null,
} = {}) {
  const normalizedMode = normalizeScheduleMode(scheduleMode);
  const normalizedTime = normalizeScheduleTime(scheduleTime);
  const normalizedWeekday = normalizeWeekday(scheduleWeekday);
  const current = getZonedParts(now, timeZone);
  const currentDate = {
    year: current.year,
    month: current.month,
    day: current.day,
  };
  const minimumDate = startDate ? parseLocalDate(startDate) : null;

  let candidateDate = minimumDate && compareLocalDates(minimumDate, currentDate) > 0
    ? minimumDate
    : currentDate;

  for (let attempts = 0; attempts < 14; attempts += 1) {
    const candidateInstant = zonedDateTimeToUtc({
      timeZone,
      year: candidateDate.year,
      month: candidateDate.month,
      day: candidateDate.day,
      time: normalizedTime,
    });
    const candidateWeekday = getWeekdayInTimeZone(candidateInstant, timeZone);

    if (!isEligibleWeekday(candidateWeekday, normalizedMode, normalizedWeekday)) {
      candidateDate = addDays(candidateDate, 1);
      continue;
    }

    if (candidateInstant.getTime() <= now.getTime() + 1_000) {
      candidateDate = addDays(candidateDate, 1);
      continue;
    }

    return candidateInstant.toISOString();
  }

  return null;
}

export function formatScheduleSummary({
  scheduleMode = 'daily',
  scheduleTime = '09:00',
  scheduleWeekday = 1,
  timeZone = 'UTC',
} = {}) {
  const normalizedMode = normalizeScheduleMode(scheduleMode);
  const normalizedTime = normalizeScheduleTime(scheduleTime);
  const weekday = WEEKDAY_NAMES[normalizeWeekday(scheduleWeekday)];

  if (normalizedMode === 'weekdays') {
    return `Weekdays at ${normalizedTime} (${timeZone})`;
  }

  if (normalizedMode === 'weekly') {
    return `Weekly on ${weekday} at ${normalizedTime} (${timeZone})`;
  }

  return `Daily at ${normalizedTime} (${timeZone})`;
}

export function formatTimestampInTimeZone(value, timeZone = 'UTC') {
  if (!value) {
    return '—';
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function getZonedParts(instant, timeZone) {
  const formatter = getPartsFormatter(timeZone);
  const parts = formatter.formatToParts(instant);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10),
    second: Number.parseInt(map.second, 10),
    weekday: WEEKDAY_MAP.get(map.weekday) ?? 0,
  };
}

function getPartsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    }));
  }

  return partsFormatterCache.get(timeZone);
}

function getOffsetFormatter(timeZone) {
  if (!offsetFormatterCache.has(timeZone)) {
    offsetFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }));
  }

  return offsetFormatterCache.get(timeZone);
}

function getTimeZoneOffsetMinutes(timeZone, instant) {
  if (timeZone === 'UTC') {
    return 0;
  }

  const parts = getOffsetFormatter(timeZone).formatToParts(instant);
  const zoneName = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  if (zoneName === 'GMT') {
    return 0;
  }

  const match = zoneName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  return sign * ((hours * 60) + minutes);
}

function zonedDateTimeToUtc({ timeZone, year, month, day, time }) {
  const [hoursRaw, minutesRaw] = normalizeScheduleTime(time).split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  const naiveUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  let candidate = new Date(naiveUtcMs);
  let offset = getTimeZoneOffsetMinutes(timeZone, candidate);
  candidate = new Date(naiveUtcMs - (offset * 60_000));

  const correctedOffset = getTimeZoneOffsetMinutes(timeZone, candidate);
  if (correctedOffset !== offset) {
    candidate = new Date(naiveUtcMs - (correctedOffset * 60_000));
  }

  return candidate;
}

function getWeekdayInTimeZone(instant, timeZone) {
  return getZonedParts(instant, timeZone).weekday;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(part => Number.parseInt(part, 10));
  return { year, month, day };
}

function addDays(dateParts, days) {
  const instant = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days));
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

function compareLocalDates(left, right) {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  if (left.month !== right.month) {
    return left.month - right.month;
  }
  return left.day - right.day;
}

function isEligibleWeekday(weekday, scheduleMode, scheduleWeekday) {
  if (scheduleMode === 'weekdays') {
    return weekday >= 1 && weekday <= 5;
  }

  if (scheduleMode === 'weekly') {
    return weekday === scheduleWeekday;
  }

  return true;
}
