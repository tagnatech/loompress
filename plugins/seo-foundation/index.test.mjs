import { describe, expect, it } from 'vitest';
import {
  buildCanonicalPath,
  buildSeoRenderContext,
  buildSitemapXml,
} from './index.mjs';

describe('seo foundation plugin helpers', () => {
  it('normalizes canonical paths and strips tracking parameters', () => {
    const canonicalPath = buildCanonicalPath({
      originalUrl: '/category/news/page/1?utm_source=mail&gclid=123&q=test',
      url: '/category/news/page/1?utm_source=mail&gclid=123&q=test',
      path: '/category/news/page/1',
    });

    expect(canonicalPath).toBe('/category/news?q=test');
  });

  it('builds article seo context with absolute image URLs and structured data', () => {
    const result = buildSeoRenderContext({
      req: {
        originalUrl: '/welcome',
        url: '/welcome',
        path: '/welcome',
        params: {},
        query: {},
      },
      site: {
        name: 'Example Site',
        base_url: 'https://example.com',
        logo_url: '/apple-icon-180x180.png',
        tagline: 'Latest updates',
      },
      view: 'post',
      options: {
        post: {
          type: 'post',
          title: 'Welcome',
          slug: 'welcome',
          excerpt: 'A short summary',
          body: '<p>Hello world</p>',
          featured_image_url: '/uploads/cover.png',
          author_name: 'Admin',
          published_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-29T00:00:00.000Z',
        },
        categories: [{ name: 'News', slug: 'news' }],
        tags: [{ name: 'Launch' }],
        title: 'Welcome',
      },
      settings: {
        titleSuffix: ' | Example Site',
        defaultDescription: '',
        noindexArchives: false,
      },
    });

    expect(result.context.title).toBe('Welcome | Example Site');
    expect(result.context.canonicalPath).toBe('/welcome');
    expect(result.context.ogImage).toBe('https://example.com/uploads/cover.png');
    expect(result.context.seoHeadHtml).toContain('BlogPosting');
    expect(result.context.seoHeadHtml).toContain('article:published_time');
  });

  it('resolves root-relative asset URLs against a path-based install', () => {
    const result = buildSeoRenderContext({
      req: {
        originalUrl: '/welcome',
        url: '/welcome',
        path: '/welcome',
        params: {},
        query: {},
      },
      site: {
        name: 'Example Site',
        base_url: 'https://example.com/blog',
        logo_url: '/assets/logo.png',
        tagline: 'Latest updates',
      },
      view: 'post',
      options: {
        post: {
          type: 'post',
          title: 'Welcome',
          slug: 'welcome',
          excerpt: 'A short summary',
          body: '<p>Hello world</p>',
          featured_image_url: '/uploads/cover.png',
          author_name: 'Admin',
          published_at: '2026-03-28T00:00:00.000Z',
          updated_at: '2026-03-29T00:00:00.000Z',
        },
        categories: [{ name: 'News', slug: 'news' }],
        tags: [{ name: 'Launch' }],
        title: 'Welcome',
      },
      settings: {
        titleSuffix: ' | Example Site',
        defaultDescription: '',
        noindexArchives: false,
      },
      basePath: '/blog',
    });

    expect(result.context.ogImage).toBe('https://example.com/blog/uploads/cover.png');
    expect(result.context.seoHeadHtml).toContain('https://example.com/blog/assets/logo.png');
  });

  it('builds a sitemap with posts, pages, categories, and tags', () => {
    const xml = buildSitemapXml({
      site: {
        base_url: 'https://example.com',
      },
      contentEntries: [
        { slug: 'hello-world', type: 'post', updated_at: '2026-03-28T00:00:00.000Z' },
        { slug: 'about', type: 'page', updated_at: '2026-03-27T00:00:00.000Z' },
      ],
      categoryEntries: [
        { slug: 'news', updated_at: '2026-03-26T00:00:00.000Z' },
      ],
      tagEntries: [
        { slug: 'launch', updated_at: '2026-03-25T00:00:00.000Z' },
      ],
    });

    expect(xml).toContain('<loc>https://example.com/hello-world</loc>');
    expect(xml).toContain('<loc>https://example.com/about</loc>');
    expect(xml).toContain('<loc>https://example.com/category/news</loc>');
    expect(xml).toContain('<loc>https://example.com/tag/launch</loc>');
  });
});
