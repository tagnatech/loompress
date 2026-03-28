# Architecture

## Overview

LoomPress is a single Express application built on `@tagna/udiot`. It serves two distinct surfaces from one process:

1. **Admin panel** — at `/admin/*`, scoped by session-stored site ID
2. **Public blog** — at `/*`, scoped by request hostname

A single instance handles all sites simultaneously. The diagram below shows how a request flows through the system.

---

## Request Flow

```
Internet
    │
    ▼
Caddy (reverse proxy + TLS)
    │
    ├── blog.dudiba.com ──────────────────────────────────┐
    ├── blog.herOreh.com ─────────────────────────────────┤
    └── cms.tagna.in (admin access) ─────────────────────┤
                                                          │
                                                          ▼
                                              LoomPress Express App (:4100)
                                                          │
                                         ┌────────────────┼────────────────┐
                                         ▼                ▼                ▼
                                  cookieParser      sessionMiddleware  siteMiddleware
                                                                       (hostname →
                                                                        req.site)
                                                          │
                                          ┌───────────────┴───────────────┐
                                          ▼                               ▼
                                   /admin/* router                 /* blog router
                                   (uses req.session.siteId)       (uses req.site)
                                          │                               │
                                          ▼                               ▼
                                   Admin controllers              Blog controllers
                                   (requireAuth guard)            (public, no auth)
                                          │                               │
                                          └──────────────┬────────────────┘
                                                         ▼
                                                   Services layer
                                                   (always scoped
                                                    by site_id)
                                                         │
                                                         ▼
                                                   PostgreSQL
                                                   (Supabase)
```

---

## Multi-Tenancy Model

LoomPress uses **hostname-based multi-tenancy** for the public blog and **session-based site switching** for the admin panel.

### Public
When a request arrives at `blog.dudiba.com`, the `siteMiddleware` runs before any route handler:

1. Reads `req.hostname` from the Express request.
2. Looks up `lp_sites WHERE hostname = $1` in PostgreSQL.
3. Caches the result in-process for 60 seconds (using udiot's `CacheManager`).
4. Attaches the site record to `req.site`.
5. If no site is found and the path is not `/admin`, returns 404.

All downstream route handlers and services receive `req.site.id` as the isolation boundary — every database query includes `WHERE site_id = $siteId`.

### Admin Panel
The admin panel does **not** use hostname for site selection. Instead:

- After login, the admin's user ID is stored in `req.session.userId`.
- Superadmins land on a site-picker page and set `req.session.siteId` via a POST to `/admin/switch-site`.
- Regular admins and authors are automatically scoped to the single site they are associated with (from `lp_site_users`).
- Every admin request verifies `req.session.siteId` is set and the user has access to that site before proceeding.

This design allows a superadmin to manage all sites from a single browser tab at a single URL (e.g. `cms.tagna.in`), without needing separate subdomains per site for the admin.

---

## Framework: @tagna/udiot

LoomPress is built on [`@tagna/udiot`](https://github.com/tagnatech/udiot), an AI-native TypeScript framework. LoomPress uses these parts of udiot:

| udiot module | Used for |
|---|---|
| `@tagna/udiot/server` (new) | Session middleware, Nunjucks template engine, file upload, flash messages, CSRF |
| `@tagna/udiot` DI container | `@Injectable` services wired through `Container` |
| `@tagna/udiot` Cache | In-process hostname → site caching (60s TTL) |
| `@tagna/udiot` Background Jobs | Scheduled post publishing (BullMQ) |
| `@tagna/udiot` Telemetry | App metrics and observability |

LoomPress also required adding the `@tagna/udiot/server` export module to the framework. See [udiot Enhancements](udiot-enhancements.md) for details.

---

## Component Choices

### Why Nunjucks (not React/Vue)?
LoomPress renders all pages server-side. The admin panel is a traditional server-rendered web app — form submit → redirect → render. Nunjucks provides layout inheritance (`{% extends %}`, `{% block %}`), loops with `{% else %}`, macros, and filters. This eliminates all client-side rendering complexity while keeping templates clean and maintainable.

### Why Trix editor (not TipTap/Quill)?
[Trix](https://trix-editor.org/) is a production-tested rich text editor built by Basecamp. It:
- Has zero JavaScript dependencies
- Is loaded from a CDN script tag — no build step or bundler needed
- Submits its content automatically with HTML form POST
- Produces clean, sanitized HTML output

### Why plain CSS (not Tailwind)?
The admin panel requires roughly 400 lines of CSS (sidebar layout, tables, forms, buttons, flash messages). Introducing Tailwind would add a build step and PostCSS pipeline without meaningful benefit at this scale. A single `admin.css` file with CSS custom properties is faster to write and easier to maintain.

### Why Express (not a Next.js plugin)?
LoomPress is **independent** of the websites it serves blogs for. Websites (dudiba.com, herOreh.com) remain unchanged — they don't import or depend on LoomPress code. The blog is served from its own subdomain. This means LoomPress works with any website technology (Next.js, plain HTML, SvelteKit, etc.).

---

## Data Isolation Guarantee

Every service method signature includes `siteId` as a **required first parameter** — it is never optional and never derived from user-controlled input. For example:

```typescript
// PostService
async getPublishedPosts(siteId: string, page: number): Promise<Post[]>
async getPostBySlug(siteId: string, slug: string): Promise<Post | null>
async createPost(siteId: string, authorId: string, data: CreatePostDto): Promise<Post>
```

Middleware enforces that `siteId` always comes from either `req.site.id` (set from hostname, not user input) or `req.session.siteId` (set by the auth system, verified on each request). There is no code path where a user can specify an arbitrary `siteId`.

---

## Scalability Notes

LoomPress is designed for small-to-medium blog traffic on a single VPS. For a single process, expect comfortable handling of:
- ~50 requests/second per site (blog page renders are Nunjucks-rendered HTML with Postgres queries)
- ~10 MB/s upload throughput for media

Horizontal scaling is possible: deploy multiple instances behind a load balancer, use a shared Postgres, and move the upload volume to object storage (e.g., Supabase Storage or S3). Session stickiness would be required if sessions stay in Postgres (they do by default with `connect-pg-simple`).

