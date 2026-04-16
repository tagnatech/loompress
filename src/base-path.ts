import type { Request } from 'express';

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:/i;

function collapseRepeatedSlashes(value: string): string {
  let result = '';
  let previousWasSlash = false;

  for (const char of value) {
    if (char === '/') {
      if (!previousWasSlash) {
        result += char;
      }
      previousWasSlash = true;
      continue;
    }

    result += char;
    previousWasSlash = false;
  }

  return result;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;

  while (end > 1 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function normalizeBasePath(input: string | null | undefined): string {
  const raw = String(input ?? '').trim();
  if (!raw || raw === '/') {
    return '';
  }

  let value = raw;

  if (ABSOLUTE_URL_RE.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return '';
    }
  }

  if (!value.startsWith('/')) {
    value = `/${value}`;
  }

  value = trimTrailingSlashes(collapseRepeatedSlashes(value));
  return value === '/' ? '' : value;
}

export function getBasePath(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeBasePath(env.BASE_PATH);
}

export function getRequestBasePath(req: Request, fallbackBasePath = getBasePath()): string {
  const forwardedPrefix = req.get('x-forwarded-prefix') ?? req.get('x-original-prefix');
  if (!forwardedPrefix) {
    return fallbackBasePath;
  }

  const rawPrefix = forwardedPrefix.split(',')[0]?.trim();
  return normalizeBasePath(rawPrefix || fallbackBasePath);
}

export function detectExternalBaseUrl(req: Request, fallbackBasePath = getBasePath()): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto ? forwardedProto.split(',')[0] : req.protocol).trim();
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost ?? req.get('host') ?? 'localhost').split(',')[0].trim();
  return `${protocol}://${host}${getRequestBasePath(req, fallbackBasePath)}`;
}

export function prefixBasePath(value: string, basePath = getBasePath()): string {
  if (!basePath) {
    return value;
  }

  const normalized = String(value ?? '');
  if (
    !normalized
    || ABSOLUTE_URL_RE.test(normalized)
    || normalized.startsWith('//')
    || normalized.startsWith('#')
  ) {
    return normalized;
  }

  if (!normalized.startsWith('/')) {
    return normalized;
  }

  if (normalized === basePath || normalized.startsWith(`${basePath}/`)) {
    return normalized;
  }

  return `${basePath}${normalized}`;
}

export function prefixBasePathInHtml(html: string, basePath = getBasePath()): string {
  if (!basePath || !html) {
    return html;
  }

  let output = html.replace(
    /((?:href|src|action|poster|content)=["'])(\/[^"']*)/gi,
    (_, prefix: string, value: string) => `${prefix}${prefixBasePath(value, basePath)}`,
  );

  output = output.replace(
    /(srcset=["'])([^"']*)(["'])/gi,
    (_, prefix: string, value: string, suffix: string) => {
      const rewritten = value
        .split(',')
        .map(candidate => {
          const trimmed = candidate.trim();
          if (!trimmed) {
            return trimmed;
          }

          const [url, ...rest] = trimmed.split(/\s+/);
          return [prefixBasePath(url, basePath), ...rest].join(' ').trim();
        })
        .join(', ');

      return `${prefix}${rewritten}${suffix}`;
    },
  );

  output = output.replace(
    /(url\(\s*(["']?))(\/[^)"']*)/gi,
    (_, prefix: string, _quote: string, value: string) => `${prefix}${prefixBasePath(value, basePath)}`,
  );

  return output;
}
