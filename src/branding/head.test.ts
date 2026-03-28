import { describe, expect, it } from 'vitest';
import { getBrandHeadHtml } from './head.js';

describe('brand head html', () => {
  it('renders the default icon pack when no custom logo exists', () => {
    const html = getBrandHeadHtml(null);

    expect(html).toContain('href="/apple-icon-180x180.png"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/manifest.json"');
    expect(html).toContain('name="msapplication-config" content="/browserconfig.xml"');
  });

  it('uses the custom logo for favicon surfaces when a logo is configured', () => {
    const html = getBrandHeadHtml('/uploads/site/logo.png');

    expect(html).toContain('rel="icon" href="/uploads/site/logo.png"');
    expect(html).toContain('rel="apple-touch-icon" href="/uploads/site/logo.png"');
    expect(html).not.toContain('/manifest.json');
  });
});
