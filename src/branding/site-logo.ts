import { getBasePath, prefixBasePath } from '../base-path.js';

export const DEFAULT_SITE_LOGO_URL = '/apple-icon-180x180.png';
export const DEFAULT_SITE_FAVICON_URL = '/favicon.ico';

export function getSiteLogoUrl(logoUrl: string | null | undefined, basePath = getBasePath()): string {
  const normalized = logoUrl?.trim();
  return prefixBasePath(normalized ? normalized : DEFAULT_SITE_LOGO_URL, basePath);
}

export function getSiteFaviconUrl(logoUrl: string | null | undefined, basePath = getBasePath()): string {
  const normalized = logoUrl?.trim();
  return prefixBasePath(normalized ? normalized : DEFAULT_SITE_FAVICON_URL, basePath);
}
