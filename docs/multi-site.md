# Multi-Site Setup

LoomPress is a multi-tenant CMS. One running instance serves multiple websites simultaneously. Each website is called a **site** in LoomPress. Sites are isolated — posts, categories, tags, media, and users from one site are completely invisible to another.

---

## How It Works

When a request arrives at the LoomPress Express process, the `siteMiddleware` resolves the site from `req.hostname`:

1. Looks up the hostname in a 60-second in-process cache.
2. On cache miss, queries `SELECT * FROM lp_sites WHERE hostname = $1`.
3. Attaches the result to `req.site: SiteContext | null`.
4. If no site is found and the request path is not under `/admin`, returns a 404.

All route handlers and services receive `req.site.id` as the isolation key. Every database query in every service includes `WHERE site_id = $siteId` — this is enforced at the service layer, not left to individual controllers.

---

## Adding a New Site

Adding a new site requires three steps. There is no code change and no process restart.

### Step 1: Insert a row in `lp_sites`

```sql
INSERT INTO lp_sites (hostname, name, slug, tagline, base_url, timezone, permalink_pattern)
VALUES (
  'blog.herOreh.com',
  'HerOreH Blog',
  'herOreh',
  'Insights from the HerOreH team',
  'https://blog.herOreh.com',
  'Asia/Kolkata',
  'slug'
);
```

| Field | Required | Notes |
|-------|----------|-------|
| `hostname` | Yes | Must exactly match the incoming `Host` header (no port, no `www`) |
| `name` | Yes | Display name shown in the admin and blog header |
| `slug` | Yes | Lowercase, no spaces; used for upload storage path |
| `base_url` | Yes | Full canonical URL including protocol, no trailing slash |
| `timezone` | No | Defaults to `UTC`; affects how dates are displayed |
| `permalink_pattern` | No | Defaults to `slug` |

### Step 2: Add a Caddy block

In the `Caddyfile` on your VPS:

```caddyfile
blog.herOreh.com {
  encode zstd gzip
  header Strict-Transport-Security "max-age=31536000"
  reverse_proxy cms:4100
}
```

Caddy will automatically obtain a TLS certificate for the new domain via Let's Encrypt. The domain must have a DNS A record pointing to your VPS IP before this step.

### Step 3: Reload Caddy

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

That's it. The new site is now live. Navigate to `https://cms.tagna.in/admin`, log in as superadmin, switch to the `herOreh` site, and start writing posts.

---

## Site Isolation Details

### Database isolation
All tables that contain site-specific data have a `site_id` column with a foreign key to `lp_sites(id)`. Cascade delete is enabled — deleting a site row removes all associated posts, categories, tags, media records, and site-user associations automatically.

Service methods always require `siteId` as a parameter:
```typescript
// Never: postService.getAll() — could leak cross-site data
// Always: postService.getPublishedPosts(siteId, page)
```

### File storage isolation
Uploaded media files are stored under `/uploads-data/{site.slug}/`. Files from different sites are in different directories. Serving is via Express static with the path `/uploads/{site.slug}/...` — a site cannot request another site's files because the `slug` in the URL must match the `req.site.slug` for the current hostname.

### Session isolation
Admin sessions store `siteId` explicitly. The `requireSiteAccess` middleware verifies that `req.session.siteId` corresponds to a site the user is actually associated with. A user cannot escalate to another site's admin by guessing a site ID.

### Cache isolation
All cache keys are namespaced: `blog:{siteId}:posts:page:1`. A cache clear triggered by a post publish on site A does not affect the cache for site B.

---

## Superadmin vs Site Admin

| Capability | Superadmin | Site Admin | Author |
|------------|-----------|-----------|--------|
| Manage all sites | ✓ | — | — |
| Create new sites | ✓ | — | — |
| Switch between sites | ✓ | — | — |
| Invite users to their site | ✓ | ✓ | — |
| Publish posts | ✓ | ✓ | — |
| Create/edit own posts | ✓ | ✓ | ✓ |
| Delete any post | ✓ | ✓ | — |
| Manage categories & tags | ✓ | ✓ | — |
| Upload media | ✓ | ✓ | ✓ |
| Edit site settings | ✓ | ✓ | — |

A superadmin does not need an entry in `lp_site_users` — their global `role = 'superadmin'` in `lp_users` grants full access everywhere.

---

## Removing a Site

```sql
-- This cascades: deletes all posts, categories, tags, media records, site_users
DELETE FROM lp_sites WHERE slug = 'herOreh';
```

Then remove the Caddy block and reload. Uploaded files on disk are **not** automatically deleted by the database cascade — run:

```bash
rm -rf /volumes/cms-uploads/herOreh/
```

---

## Per-Site Settings

Each site can be configured via the admin panel at `/admin/sites/:id/edit` (superadmin) or `/admin/settings` (site admin):

| Setting | Description |
|---------|-------------|
| Name | Display name (blog header, RSS `<title>`) |
| Tagline | Short description (blog subheader, RSS `<description>`) |
| Logo URL | Image URL shown in the blog header |
| Timezone | Affects date display across admin and public blog |
| Permalink pattern | URL structure for posts: `slug`, `dated`, or `category-slug` |
| Base URL | Canonical URL for absolute links (sitemap, RSS, Open Graph) |

---

## Typical Multi-Site Deployment

```
VPS IP: 1.2.3.4

DNS:
  blog.dudiba.com    A  1.2.3.4
  blog.herOreh.com   A  1.2.3.4
  cms.tagna.in       A  1.2.3.4

Caddyfile:
  blog.dudiba.com   → reverse_proxy cms:4100
  blog.herOreh.com  → reverse_proxy cms:4100
  cms.tagna.in      → reverse_proxy cms:4100   (admin access from any hostname)

LoomPress process: cms:4100
  req.hostname = 'blog.dudiba.com'   → req.site = { id: '...', slug: 'dudiba', ... }
  req.hostname = 'blog.herOreh.com'  → req.site = { id: '...', slug: 'herOreh', ... }
  req.hostname = 'cms.tagna.in'      → req.site = null  (admin panel, site from session)
```

