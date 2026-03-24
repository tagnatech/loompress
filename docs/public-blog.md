# Public Blog

The public blog is served at the root path (`/`) of each site's domain. It is completely separate from the admin panel and requires no authentication. All pages are server-rendered on each request using Nunjucks templates.

---

## Routes

All routes are scoped to the site resolved from `req.hostname` by `siteMiddleware`. If the hostname is unknown, a 404 is returned before reaching any blog route.

```
GET /                          Post list — page 1
GET /page/:n                   Post list — page n (20 posts per page)
GET /category/:slug            Category archive — all published posts in the category
GET /category/:slug/page/:n    Category archive — paginated
GET /tag/:slug                 Tag archive — all published posts with the tag
GET /tag/:slug/page/:n         Tag archive — paginated
GET /:slug                     Single post (catch-all, always last)
GET /feed.xml                  RSS 2.0 feed for the site
GET /sitemap.xml               XML sitemap for the site
```

The single-post catch-all (`/:slug`) comes last so that `/feed.xml`, `/sitemap.xml`, `/category/*`, `/tag/*`, and `/page/*` are matched first.

---

## Permalink Patterns

Each site has a `permalink_pattern` setting that determines how post URLs are structured.

| Pattern | URL format | Example |
|---------|-----------|---------|
| `slug` (default) | `/:slug` | `/my-first-post` |
| `dated` | `/:year/:month/:day/:slug` | `/2026/03/24/my-first-post` |
| `category-slug` | `/:categorySlug/:slug` | `/engineering/my-first-post` |

The permalink resolver in `src/public-blog/permalink.ts` generates and parses URLs according to the current site's setting. When a post is moved between categories or its slug is changed, old URLs should be handled with 301 redirects (planned feature).

---

## Post List Page

`GET /` and `GET /page/:n`

Queries `cms_posts WHERE site_id = $siteId AND status = 'published' ORDER BY published_at DESC LIMIT 20 OFFSET ...`

Each post card in the list shows:
- Featured image (if set)
- Title (links to the post)
- Published date (formatted per site timezone)
- Excerpt (or first 150 characters of the body, stripped of HTML)
- Author display name
- Primary category (first category, linked)
- Read time estimate (words / 200 wpm)

Pagination links appear at the bottom when there are more than 20 published posts.

---

## Single Post Page

`GET /:slug`

Queries `cms_posts WHERE site_id = $siteId AND slug = $slug AND status = 'published'`.

Returns 404 if not found. Scheduled and private posts are not accessible via the public blog.

The post template renders:
- `<title>` → `post.meta_title OR post.title`
- `<meta name="description">` → `post.meta_description OR post.excerpt`
- `<link rel="canonical">` → the post's canonical URL based on `site.base_url` + permalink
- Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`)
- Twitter Card tags
- Published date in `<time datetime="...">` (ISO 8601)
- Category and tag links
- Previous / next post navigation links (by `published_at`)

---

## Category & Tag Pages

Category and tag archive pages follow the same layout as the post list, with a heading showing the category/tag name and optional description (for categories).

Category archives include all posts in the category and **all descendant subcategories** (using a recursive query on `parent_id`).

---

## RSS Feed

`GET /feed.xml`

Returns a valid RSS 2.0 XML document for the current site. Contains the 20 most recently published posts.

Feed metadata:
```xml
<channel>
  <title>{site.name}</title>
  <link>{site.base_url}</link>
  <description>{site.tagline}</description>
  <language>en</language>
  <lastBuildDate>{RFC 2822 date}</lastBuildDate>
  <atom:link href="{site.base_url}/feed.xml" rel="self" type="application/rss+xml"/>
```

Each `<item>` includes:
```xml
<item>
  <title>{post.title}</title>
  <link>{post permalink}</link>
  <guid isPermaLink="true">{post permalink}</guid>
  <pubDate>{RFC 2822 date}</pubDate>
  <description>{post.excerpt or truncated body}</description>
  <content:encoded><![CDATA[{post.body}]]></content:encoded>
  <category>{category name}</category>
</item>
```

The feed is generated as a raw string (no XML library dependency) and served with `Content-Type: application/rss+xml; charset=utf-8`.

---

## Sitemap

`GET /sitemap.xml`

Returns a standard XML sitemap for the site. Includes:
- The blog homepage (`/`)
- All published post URLs (with `<lastmod>` set to `updated_at`)
- All category URLs

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://blog.dudiba.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://blog.dudiba.com/my-first-post</loc>
    <lastmod>2026-03-24</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

Served with `Content-Type: application/xml; charset=utf-8`.

---

## Caching

Rendered blog pages are cached in-process using udiot's `CacheManager` to avoid hitting Postgres on every request.

| Page | Cache TTL |
|------|-----------|
| Post list (page 1) | 10 minutes |
| Post list (page > 1) | 30 minutes |
| Single post | 5 minutes |
| Category / tag archive | 15 minutes |
| RSS feed | 15 minutes |
| Sitemap | 60 minutes |

Cache is **invalidated automatically** when:
- A post is published, updated, or deleted (the `PostService` clears relevant cache keys)
- A category or tag is changed

Cache keys are namespaced by `siteId` to ensure isolation between sites.

---

## Public Blog Templates

```
src/public-blog/views/
├── layout.njk       Base layout: site name, logo, nav, footer, head meta tags
├── index.njk        Post list: post cards grid + pagination
├── post.njk         Single post: title, meta, body HTML, prev/next nav
├── category.njk     Category archive: heading + post list + pagination
└── tag.njk          Tag archive: heading + post list + pagination
```

The public blog templates are intentionally minimal: clean typography, responsive layout, no third-party CSS or JS loaded. Sites can be themed via site-specific CSS overrides (planned feature: per-site custom CSS stored in `cms_sites`).

---

## SEO Checklist

Every public blog page includes:

- [x] `<title>` (post meta_title or title, category name, or site name)
- [x] `<meta name="description">`
- [x] `<link rel="canonical">`
- [x] `og:title`, `og:description`, `og:url`, `og:image`, `og:type`
- [x] `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- [x] `<time datetime="...">` on post dates (machine-readable ISO 8601)
- [x] Pagination `<link rel="prev">` and `<link rel="next">`
- [x] `/sitemap.xml` linked in `<head>` as `<link rel="sitemap">`
- [x] `/feed.xml` linked in `<head>` as `<link rel="alternate" type="application/rss+xml">`
- [x] `robots.txt` served at `/robots.txt` (allows all crawlers, points to sitemap)
