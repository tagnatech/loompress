import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_FAVICON_URL,
  DEFAULT_SITE_LOGO_URL,
  getSiteFaviconUrl,
  getSiteLogoUrl,
} from './site-logo.js';

describe('site logo defaults', () => {
  it('falls back to the bundled logo when none is configured', () => {
    expect(getSiteLogoUrl(null)).toBe(DEFAULT_SITE_LOGO_URL);
    expect(getSiteLogoUrl(undefined)).toBe(DEFAULT_SITE_LOGO_URL);
    expect(getSiteLogoUrl('   ')).toBe(DEFAULT_SITE_LOGO_URL);
  });

  it('preserves a configured logo URL', () => {
    expect(getSiteLogoUrl('/uploads/site/logo.png')).toBe('/uploads/site/logo.png');
  });

  it('uses a dedicated favicon fallback when no custom logo exists', () => {
    expect(getSiteFaviconUrl(null)).toBe(DEFAULT_SITE_FAVICON_URL);
    expect(getSiteFaviconUrl('/uploads/site/logo.png')).toBe('/uploads/site/logo.png');
  });

  it('points bundled defaults at the shipped brand icon set', () => {
    expect(DEFAULT_SITE_LOGO_URL).toBe('/apple-icon-180x180.png');
    expect(DEFAULT_SITE_FAVICON_URL).toBe('/favicon.ico');
  });
});
