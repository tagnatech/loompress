# Development Guide

---

## Prerequisites

- Node.js 22+
- PostgreSQL (or a Supabase project)

---

## Setup

```bash
# Clone the repo
git clone https://github.com/tagnatech/loompress.git
cd loompress

# Install dependencies
npm install

# Optional: copy and configure environment ahead of time
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and a 32+ character SESSION_SECRET

# Start dev server (with hot reload via tsx watch)
npm run dev
```

If `.env` is missing or incomplete, open `http://localhost:4100/install/database` and use the installer. It will:

- save `DATABASE_URL` and `SESSION_SECRET` into `.env`
- verify the database connection
- run migrations
- continue to the site/admin onboarding flow

If you prefer the manual path, you can still run:

```bash
npm run migrate
npm run seed:admin -- --email admin@example.com --password "change-me-now-123"
```

Admin panel after setup: `http://localhost:4100/admin/login`

User-managed static files live under `./assets` by default and are served at `/assets/...`. LoomPress creates these subdirectories automatically:

- `assets/default`
- `assets/images`
- `assets/js`
- `assets/ts`

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Express server with `tsx watch` (restarts on file change) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` (production) |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run migrate:reset` | Drop and recreate all `lp_*` tables (dev only) |
| `npm run seed:admin` | Create a superadmin user (accepts `--email`, `--password`, `--name`) |
| `npm run seed:site` | Create a site row (accepts `--hostname`, `--name`, `--slug`, `--base-url`) |
| `npm run lint` | Run the repository typecheck (`tsc --noEmit`) |
| `npm test` | Run tests (Vitest) |
| `npm run check` | Run typecheck, tests, and production build |

---

## Project Structure

```
loompress/
├── src/
│   ├── server.ts               ← Express app entry: registers middleware, mounts routers, runs migrations
│   │
│   ├── config/
│   │   └── index.ts            ← Reads process.env, validates required vars, exports typed Config
│   │
│   ├── db/
│   │   ├── client.ts           ← Exports a singleton pg.Pool (one connection pool per process)
│   │   ├── migrate.ts          ← Reads migrations/ in order, tracks applied files in _lp_migrations
│   │   └── migrations/
│   │       └── 001_initial_schema.sql
│   │
│   ├── multi-site/
│   │   ├── resolver.ts         ← findByHostname(hostname): queries lp_sites, caches 60s
│   │   ├── middleware.ts       ← siteMiddleware: attaches req.site from req.hostname
│   │   └── types.ts            ← Express Request augmentation: req.site: SiteContext | null
│   │
│   ├── auth/
│   │   ├── session.ts          ← Wires createSessionMiddleware() with the pg pool from db/client.ts
│   │   ├── middleware.ts       ← requireAuth(), requireSiteAccess()
│   │   └── password.ts        ← hashPassword(plain), verifyPassword(plain, hash) using bcrypt
│   │
│   ├── services/               ← Business logic only — no Express req/res here
│   │   ├── SiteService.ts
│   │   ├── PostService.ts
│   │   ├── CategoryService.ts
│   │   ├── TagService.ts
│   │   ├── MediaService.ts
│   │   └── UserService.ts
│   │
│   ├── admin/
│   │   ├── router.ts           ← createAdminRouter(): mounts all sub-routers, applies requireAuth
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── dashboard.controller.ts
│   │   │   ├── posts.controller.ts
│   │   │   ├── media.controller.ts
│   │   │   ├── categories.controller.ts
│   │   │   ├── tags.controller.ts
│   │   │   ├── sites.controller.ts
│   │   │   └── users.controller.ts
│   │   └── views/              ← Nunjucks templates (.njk)
│   │       └── ...
│   │
│   ├── public/
│   │   ├── router.ts           ← createBlogRouter(): mounts public routes
│   │   ├── controllers/
│   │   │   ├── blog.controller.ts
│   │   │   ├── feed.controller.ts
│   │   │   └── sitemap.controller.ts
│   │   └── views/
│   │       └── ...
│   │
│   ├── plugins/
│   │   ├── loader.ts           ← Runtime plugin discovery + dynamic import
│   │   ├── runtime.ts          ← Admin nav visibility helpers
│   │   └── types.ts            ← Public plugin API types
│   │
│   ├── uploads/
│   │   ├── middleware.ts       ← Wires createUploadMiddleware() from @tagna/udiot/server
│   │   └── storage.ts         ← resolveStoragePath(), resolvePublicUrl()
│   │
│   └── scripts/               ← Standalone Node scripts (not part of the server)
│       ├── seed-admin.ts
│       └── seed-site.ts
│
├── docs/                      ← This documentation
├── assets/                    ← User-managed static files served at /assets/*
├── examples/                  ← Sample plugins and integrations
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Architecture Conventions

### Services
Services in `src/services/` are plain TypeScript classes decorated with `@Injectable` from `@tagna/udiot`. They accept a `pool: Pool` via constructor injection and execute SQL directly (no ORM).

Every public method that reads or writes site-specific data takes `siteId: string` as its first argument. This is not optional.

```typescript
@Injectable()
export class PostService {
  constructor(private pool: Pool) {}

  async getPublishedPosts(siteId: string, page = 1): Promise<Post[]> {
    const limit = 20;
    const offset = (page - 1) * limit;
    const { rows } = await this.pool.query<Post>(
      `SELECT * FROM lp_posts
       WHERE site_id = $1 AND status = 'published'
       ORDER BY published_at DESC
       LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );
    return rows;
  }
}
```

### Controllers
Controllers are Express route handler functions (not classes). They extract data from `req`, call the appropriate service, and either render a template or redirect.

```typescript
// admin/controllers/posts.controller.ts
export const list: express.RequestHandler = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const posts = await postService.getPublishedPosts(req.session.siteId!, page);
  res.render('posts/list', { posts, page });
};
```

### Templates
Nunjucks templates are in `src/admin/views/` and `src/public/themes/`. All admin templates extend `layout.njk`. Public templates are organized per theme under their own `layout.njk`.

Template variables are passed via `res.render('template', { ...variables })`. No global template variables other than `flash` (set by `flashMiddleware`) and `csrfToken` (set by `csrfMiddleware`).

### Routing
Routers are created by factory functions (`createAdminRouter()`, `createBlogRouter()`) that accept service instances as parameters. This makes unit testing easy — pass mock services to the router factory.

```typescript
// src/server.ts
const adminRouter = createAdminRouter({ postService, mediaService, ... });
const blogRouter = createBlogRouter({ postService, categoryService, ... });

app.use('/admin', adminRouter);
app.use('/', blogRouter);
```

### Plugins

LoomPress can load runtime plugins from `PLUGINS_DIR` or an explicit `PLUGINS` list. Plugins are plain JavaScript modules that can:

- run startup hooks
- register admin/public routes
- add admin sidebar links
- provide extra admin Nunjucks view directories
- serve static assets

See [Plugins](plugins.md) for the full contract and the sample plugin under `examples/plugins/hello-world/`.

---

## Adding a New Admin Feature

Example: adding a "Pages" section (for static pages like About, Contact).

1. **Service method**: Add `getPages(siteId)`, `createPage(siteId, data)` etc. to `PostService` (pages use the same `lp_posts` table with `type = 'page'`).

2. **Controller**: Create `src/admin/controllers/pages.controller.ts` with `list`, `edit`, `create`, `delete` handlers.

3. **Views**: Add `src/admin/views/pages/list.njk` and `src/admin/views/pages/edit.njk`.

4. **Router**: Add the pages routes to `src/admin/router.ts`:
   ```typescript
   adminRouter.get('/pages', requireAuth, requireSiteAccess, pagesController.list);
   adminRouter.get('/pages/new', requireAuth, requireSiteAccess, pagesController.new);
   adminRouter.post('/pages/new', requireAuth, requireSiteAccess, pagesController.create);
   // ...
   ```

5. **Sidebar link**: Add a "Pages" link to `src/admin/views/layout.njk`.

---

## Working with @tagna/udiot Locally

LoomPress now consumes the published `@tagna/udiot` package by default. If you need to test local framework changes, switch the dependency to a local `file:` reference temporarily, run `npm install`, and then restart LoomPress.

---

## Testing

Unit tests use Vitest. Run with:

```bash
npm test
npm run test:watch   # Watch mode
npm run test:coverage
```

**What to test:**
- `services/` — test each service method with a real test database (or `pg-mem` in-memory Postgres for speed)
- `multi-site/resolver.ts` — test hostname lookup and cache behavior
- `auth/password.ts` — test hash and verify
- `public/` — test public routing and permalink behavior for each pattern

**What not to unit-test:**
- Controllers (test these with integration tests instead)
- Nunjucks templates (test visually or with snapshot tests)

---

## Linting

```bash
npm run lint
```

`npm run lint` currently runs the repository typecheck (`tsc --noEmit`). Use `npm run check` before opening a PR or publishing a release.

## Install Flow

LoomPress now has two setup phases:

1. Installer mode at `/install/database` when `DATABASE_URL` or `SESSION_SECRET` is missing.
2. Onboarding mode at `/` after the database is ready but before the first admin exists.

Installer mode is intentionally outside the fully booted app so the database connection can be configured before normal middleware and services initialize.

