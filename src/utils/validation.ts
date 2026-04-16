const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SITE_ROLES = ['author', 'admin'] as const;
export const GLOBAL_ROLES = ['author', 'admin', 'superadmin'] as const;
export const POST_STATUSES = ['draft', 'published', 'scheduled', 'private'] as const;
export const PAGE_STATUSES = ['draft', 'published'] as const;
export const PERMALINK_PATTERNS = ['slug', 'dated', 'category-slug'] as const;
export const DATE_FORMATS = ['DD MMM YYYY', 'MMM DD, YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'] as const;
export const MENU_LOCATIONS = ['primary', 'footer', 'social'] as const;

type TupleValue<T extends readonly string[]> = T[number];

function trimTrailingChar(value: string, char: string): string {
  let end = value.length;

  while (end > 1 && value[end - 1] === char) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sanitizeSingleLine(input: unknown, maxLength = 255): string {
  const value = String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return value.slice(0, maxLength);
}

export function sanitizeMultilineText(input: unknown, maxLength = 5000): string {
  const value = String(input ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  return value.slice(0, maxLength);
}

export function normalizeOptionalText(input: unknown, maxLength = 255): string | undefined {
  const value = sanitizeSingleLine(input, maxLength);
  return value || undefined;
}

export function normalizeOptionalMultilineText(input: unknown, maxLength = 5000): string | undefined {
  const value = sanitizeMultilineText(input, maxLength);
  return value || undefined;
}

export function normalizeEmail(input: unknown): string {
  const value = sanitizeSingleLine(input, 320).toLowerCase();
  if (!EMAIL_RE.test(value)) {
    throw new Error('Enter a valid email address.');
  }
  return value;
}

export function normalizeHostname(input: unknown): string {
  const raw = sanitizeSingleLine(input, 255);
  if (!raw) {
    throw new Error('Hostname is required.');
  }

  const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname)) {
    throw new Error('Enter a valid hostname.');
  }

  return hostname;
}

export function normalizeBaseUrl(input: unknown): string {
  const raw = sanitizeSingleLine(input, 2048);
  if (!raw) {
    throw new Error('Base URL is required.');
  }

  const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL must use http or https.');
  }

  if (parsed.search || parsed.hash) {
    throw new Error('Base URL must not include a query string or fragment.');
  }

  const pathname = trimTrailingChar(parsed.pathname, '/');
  return `${parsed.origin}${pathname === '/' ? '' : pathname}`;
}

export function assertBaseUrlMatchesHostname(hostname: string, baseUrl: string): void {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const parsed = new URL(normalizedBaseUrl);

  if (parsed.hostname.toLowerCase().replace(/\.+$/, '') !== normalizedHostname) {
    throw new Error('Base URL hostname must match the hostname field.');
  }
}

export function normalizeOptionalHttpUrl(input: unknown): string | undefined {
  const raw = sanitizeSingleLine(input, 2048);
  if (!raw) {
    return undefined;
  }

  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL must use http or https.');
  }

  return parsed.toString();
}

export function normalizeOptionalPublicUrl(input: unknown): string | undefined {
  const raw = sanitizeSingleLine(input, 2048);
  if (!raw) {
    return undefined;
  }

  if (raw.startsWith('/')) {
    return raw;
  }

  return normalizeOptionalHttpUrl(raw);
}

export function normalizeUuid(input: unknown, fieldName = 'Value'): string {
  const value = sanitizeSingleLine(input, 64);
  if (!UUID_RE.test(value)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value;
}

export function isUuid(input: unknown): boolean {
  return UUID_RE.test(sanitizeSingleLine(input, 64));
}

export function normalizeFromOptions<T extends readonly string[]>(
  input: unknown,
  allowed: T,
  fallback: TupleValue<T>,
): TupleValue<T> {
  const value = sanitizeSingleLine(input, 64);
  return (allowed as readonly string[]).includes(value) ? value as TupleValue<T> : fallback;
}

export function normalizeSiteRole(input: unknown): TupleValue<typeof SITE_ROLES> {
  return normalizeFromOptions(input, SITE_ROLES, 'author');
}

export function normalizeGlobalRole(input: unknown): TupleValue<typeof GLOBAL_ROLES> {
  return normalizeFromOptions(input, GLOBAL_ROLES, 'author');
}

export function normalizePostStatus(input: unknown): TupleValue<typeof POST_STATUSES> {
  return normalizeFromOptions(input, POST_STATUSES, 'draft');
}

export function normalizePageStatus(input: unknown): TupleValue<typeof PAGE_STATUSES> {
  return normalizeFromOptions(input, PAGE_STATUSES, 'draft');
}

export function normalizeDateFormat(input: unknown): TupleValue<typeof DATE_FORMATS> {
  return normalizeFromOptions(input, DATE_FORMATS, 'DD MMM YYYY');
}

export function normalizeMenuLocation(input: unknown): TupleValue<typeof MENU_LOCATIONS> {
  return normalizeFromOptions(input, MENU_LOCATIONS, 'primary');
}

export function requireNonEmptyText(input: unknown, fieldName: string, maxLength = 255): string {
  const value = sanitizeSingleLine(input, maxLength);
  if (!value) {
    throw new Error(`${fieldName} is required.`);
  }
  return value;
}

export function parseIntegerInRange(
  input: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = sanitizeSingleLine(input, 32);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeScheduledAt(input: unknown): string | undefined {
  const raw = sanitizeSingleLine(input, 64);
  if (!raw) {
    return undefined;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Schedule date is invalid.');
  }

  if (parsed.getTime() <= Date.now()) {
    throw new Error('Schedule date must be in the future.');
  }

  return parsed.toISOString();
}

export function sanitizeCustomCss(input: unknown): string | undefined {
  const raw = sanitizeMultilineText(input, 20_000);
  if (!raw) {
    return undefined;
  }

  return raw.replace(/<\/style/gi, '<\\/style');
}
