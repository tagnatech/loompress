import { describe, expect, it } from 'vitest';
import {
  assertBaseUrlMatchesHostname,
  normalizeBaseUrl,
  normalizeHostname,
  normalizeScheduledAt,
  sanitizeCustomCss,
  slugify,
} from './validation.js';

describe('validation utilities', () => {
  it('normalizes hostnames safely', () => {
    expect(normalizeHostname('BLOG.Example.com.')).toBe('blog.example.com');
    expect(normalizeHostname('localhost')).toBe('localhost');
  });

  it('rejects base URLs with extra path components', () => {
    expect(() => normalizeBaseUrl('https://example.com/blog')).toThrow(/must not include a path/i);
  });

  it('requires base url hostname to match the site hostname', () => {
    expect(() => assertBaseUrlMatchesHostname('blog.example.com', 'https://www.example.com')).toThrow(/must match/i);
    expect(() => assertBaseUrlMatchesHostname('blog.example.com', 'https://blog.example.com')).not.toThrow();
  });

  it('sanitizes custom css to prevent style tag breakout', () => {
    expect(sanitizeCustomCss('body{color:red}</style><script>alert(1)</script>'))
      .toContain('<\\/style>');
  });

  it('requires future schedule dates', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(normalizeScheduledAt(future)).toBeTruthy();
    expect(() => normalizeScheduledAt(new Date(Date.now() - 60_000).toISOString())).toThrow(/future/i);
  });

  it('creates stable slugs', () => {
    expect(slugify(' Hello, LoomPress World! ')).toBe('hello-loompress-world');
  });
});
