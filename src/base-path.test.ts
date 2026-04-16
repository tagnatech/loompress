import { describe, expect, it } from 'vitest';
import { normalizeBasePath, prefixBasePath, prefixBasePathInHtml } from './base-path.js';

describe('base path helpers', () => {
  it('normalizes configured base paths', () => {
    expect(normalizeBasePath('blog')).toBe('/blog');
    expect(normalizeBasePath('/blog/')).toBe('/blog');
    expect(normalizeBasePath('///blog///nested///')).toBe('/blog/nested');
    expect(normalizeBasePath('https://example.com/blog/')).toBe('/blog');
    expect(normalizeBasePath('/')).toBe('');
  });

  it('prefixes root-relative paths without touching absolute URLs', () => {
    expect(prefixBasePath('/admin/login', '/blog')).toBe('/blog/admin/login');
    expect(prefixBasePath('/blog/admin/login', '/blog')).toBe('/blog/admin/login');
    expect(prefixBasePath('https://example.com/admin/login', '/blog')).toBe('https://example.com/admin/login');
  });

  it('rewrites html attributes and style urls', () => {
    const html = [
      '<link rel="stylesheet" href="/admin/css/admin.css">',
      '<img src="/uploads/site/logo.png">',
      '<form action="/admin/login"></form>',
      '<div style="background-image:url(/assets/bg.png)"></div>',
    ].join('');

    const rewritten = prefixBasePathInHtml(html, '/blog');

    expect(rewritten).toContain('href="/blog/admin/css/admin.css"');
    expect(rewritten).toContain('src="/blog/uploads/site/logo.png"');
    expect(rewritten).toContain('action="/blog/admin/login"');
    expect(rewritten).toContain('url(/blog/assets/bg.png)');
  });
});
