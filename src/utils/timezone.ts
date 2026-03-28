export interface TimeZoneOption {
  value: string;
  label: string;
  offsetMinutes: number;
}

const REFERENCE_DATE = new Date('2026-01-01T00:00:00.000Z');

export function getTimeZoneOptions(selectedValue?: string | null): TimeZoneOption[] {
  const timeZones = new Set<string>(['UTC', ...Intl.supportedValuesOf('timeZone')]);
  const normalizedSelected = normalizeSelectedTimeZone(selectedValue);

  if (normalizedSelected) {
    timeZones.add(normalizedSelected);
  }

  return [...timeZones]
    .map(value => ({
      value,
      offsetMinutes: getTimeZoneOffsetMinutes(value),
    }))
    .sort((left, right) => compareTimeZones(left, right))
    .map(option => ({
      ...option,
      label: `${formatUtcOffset(option.offsetMinutes)} ${option.value}`,
    }));
}

export function normalizeTimeZone(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return 'UTC';
  }

  if (raw === 'UTC') {
    return raw;
  }

  if (!Intl.supportedValuesOf('timeZone').includes(raw)) {
    throw new Error('Choose a valid timezone.');
  }

  return raw;
}

function normalizeSelectedTimeZone(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compareTimeZones(
  left: Pick<TimeZoneOption, 'value' | 'offsetMinutes'>,
  right: Pick<TimeZoneOption, 'value' | 'offsetMinutes'>,
): number {
  if (left.value === 'UTC') {
    return right.value === 'UTC' ? 0 : -1;
  }

  if (right.value === 'UTC') {
    return 1;
  }

  const bucketDiff = getSortBucket(left.offsetMinutes) - getSortBucket(right.offsetMinutes);
  if (bucketDiff !== 0) {
    return bucketDiff;
  }

  if (left.offsetMinutes !== right.offsetMinutes) {
    if (left.offsetMinutes >= 0 && right.offsetMinutes >= 0) {
      return left.offsetMinutes - right.offsetMinutes;
    }

    if (left.offsetMinutes < 0 && right.offsetMinutes < 0) {
      return Math.abs(left.offsetMinutes) - Math.abs(right.offsetMinutes);
    }

    return left.offsetMinutes - right.offsetMinutes;
  }

  return left.value.localeCompare(right.value);
}

function getSortBucket(offsetMinutes: number): number {
  if (offsetMinutes === 0) {
    return 0;
  }

  return offsetMinutes > 0 ? 1 : 2;
}

function getTimeZoneOffsetMinutes(timeZone: string): number {
  if (timeZone === 'UTC') {
    return 0;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
  });
  const part = formatter.formatToParts(REFERENCE_DATE).find(item => item.type === 'timeZoneName')?.value ?? 'GMT';

  if (part === 'GMT') {
    return 0;
  }

  const match = part.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');

  return sign * ((hours * 60) + minutes);
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');

  return `UTC${sign}${hours}:${minutes}`;
}
