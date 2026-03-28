export const DEFAULT_SITE_LOGO_URL = '/apple-icon-180x180.png';
export const DEFAULT_SITE_FAVICON_URL = '/favicon.ico';

export function getSiteLogoUrl(logoUrl: string | null | undefined): string {
  const normalized = logoUrl?.trim();
  return normalized ? normalized : DEFAULT_SITE_LOGO_URL;
}

export function getSiteFaviconUrl(logoUrl: string | null | undefined): string {
  const normalized = logoUrl?.trim();
  return normalized ? normalized : DEFAULT_SITE_FAVICON_URL;
}
