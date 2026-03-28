# LoomPress

A lightweight, multi-site blog CMS built with the [`@tagna/udiot`](https://github.com/tagnatech/udiot) TypeScript framework. LoomPress is a standalone full-stack application — think WordPress, but without the complexity.

One running instance serves multiple websites simultaneously. Each site gets its own blog at a subdomain (e.g. `blog.dudiba.com`, `blog.herOreh.com`), its own admin panel, and fully isolated content. Adding a new site requires only a database row and a Caddy reverse proxy entry — no code changes, no restarts.

---

## Why LoomPress?

| Need | LoomPress does |
|------|---------------|
| Blog for multiple websites | Multi-tenant: one process, many sites, hostname routing |
| Simple CMS without WordPress complexity | Web-based admin panel, write in a rich text editor, publish |
| Shared codebase across all sites | Single deployment serves all blogs |
| No vendor lock-in | Self-hosted on your own VPS via Docker |
| Built with your own framework | Built entirely on `@tagna/udiot` |

---

## Features

- **Multi-site**: Serve unlimited sites from one instance. Isolated posts, categories, tags, media, and users per site.
- **Admin panel**: Server-rendered web UI — no SPA, no heavy JS bundle.
- **Rich text editing**: [Trix](https://trix-editor.org/) editor (by Basecamp) — clean HTML output, zero config.
- **Media library**: Upload images, manage a per-site media library, select featured images.
- **Taxonomy**: Categories (hierarchical) and tags per site.
- **Post scheduling**: Set a future `published_at` date; a background job publishes on time.
- **SEO built-in**: Per-post meta title, meta description, Open Graph tags, canonical URLs.
- **Bundled SEO extension**: Auto-loaded `SEO Foundation` plugin adds sitemap coverage for pages/tags/categories, structured data, robots directives, and cleaner canonical handling for archive/search routes.
- **AI autoblogging extension**: Auto-loaded `AI Autoblog` plugin schedules OpenRouter-powered strategy/writer/editor agents to create SEO-aware posts with featured images.
- **RSS feed**: `/feed.xml` per site, auto-generated from published posts.
- **Sitemap**: `/sitemap.xml` per site.
- **Plugin support**: Load runtime plugins for admin routes, public routes, sidebar links, admin views, and static assets.
- **Role-based access**: `superadmin`, `admin`, `author` roles with per-site permission scoping.
- **Self-hosted**: Docker + Caddy. TLS auto-provisioned by Caddy via Let's Encrypt.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [`@tagna/udiot`](https://github.com/tagnatech/udiot) (Express + DI + SSR) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL (via Supabase or self-hosted) |
| Templates | Nunjucks (server-rendered HTML, layout inheritance) |
| Rich text | Trix editor (CDN, no build step) |
| Sessions | `express-session` + `connect-pg-simple` |
| File uploads | `multer` |
| Auth | `bcrypt` password hashing, session-cookie auth |
| Deployment | Docker + Caddy reverse proxy |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/tagnatech/loompress.git
cd loompress
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET (32+ chars)
```

You can also skip this step on a fresh install and let LoomPress create `.env` from the browser installer.

LoomPress also creates a WordPress-style user asset area at `./assets` by default. Files placed there are served publicly at `/assets/...`.

Optional for the bundled `AI Autoblog` plugin:

```bash
# Lets the plugin use an environment-level OpenRouter key by default
echo OPENROUTER_API_KEY=your-key-here >> .env
```

Example asset paths:

```text
assets/images/logo.png -> /assets/images/logo.png
assets/js/site.js      -> /assets/js/site.js
assets/ts/demo.ts      -> /assets/ts/demo.ts
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Seed the first superadmin user

```bash
npm run seed:admin -- --email admin@example.com --password "change-me-now-123"
```

### 5. Start in development

```bash
npm run dev
```

Fresh install: `http://localhost:4100/install/database`

Admin panel after setup: `http://localhost:4100/admin/login`

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, request flow, multi-site model |
| [Database Schema](docs/database-schema.md) | All tables, columns, indexes, relationships |
| [udiot Enhancements](docs/udiot-enhancements.md) | New `@tagna/udiot/server` module added for LoomPress |
| [Admin Panel](docs/admin-panel.md) | Admin UI routes, views, editor, media library |
| [Public](docs/public.md) | Public routes, permalink patterns, RSS, sitemap |
| [Multi-Site Setup](docs/multi-site.md) | How to add a new site, hostname routing, isolation |
| [Deployment](docs/deployment.md) | Docker, Caddy, VPS deployment, environment variables |
| [Development Guide](docs/development.md) | Local setup, project structure, coding conventions |
| [Plugins](docs/plugins.md) | Runtime plugin loading, API surface, and sample plugin |

---

## Project Structure

```
loompress/
├── src/
│   ├── server.ts               # Express app entry point
│   ├── config/                 # Typed environment config
│   ├── db/                     # DB client, migrations
│   ├── multi-site/             # Hostname → site resolution
│   ├── auth/                   # Session, password, middleware guards
│   ├── services/               # Business logic (PostService, SiteService, …)
│   ├── admin/                  # Admin panel: controllers + Nunjucks views
│   ├── public/                 # Public site: controllers + Nunjucks themes
│   ├── plugins/                # Plugin loader/runtime types
│   └── uploads/                # multer config, path resolution
├── docs/                       # Full documentation
├── examples/                   # Sample plugins and integrations
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

---

## License

[MIT](LICENSE) © [Tagnatech](https://tagna.in)
