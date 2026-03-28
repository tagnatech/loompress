# Database Schema

LoomPress uses PostgreSQL. All tables are prefixed `lp_` to avoid collisions when sharing a database (e.g. an existing Supabase project) with other applications.

The full schema is in `src/db/migrations/001_initial_schema.sql`.

---

## Tables

### `lp_sites`

One row per website that LoomPress serves.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated (`gen_random_uuid()`) |
| `hostname` | `text` UNIQUE NOT NULL | The exact hostname to match: `blog.dudiba.com` |
| `name` | `text` NOT NULL | Display name: `Dudiba Blog` |
| `slug` | `text` UNIQUE NOT NULL | URL-safe internal key: `dudiba` (used for upload paths) |
| `tagline` | `text` | Short site description shown in the blog header |
| `logo_url` | `text` | URL of the site logo image |
| `base_url` | `text` NOT NULL | Canonical public URL: `https://blog.dudiba.com` |
| `timezone` | `text` | IANA timezone string, default `UTC` |
| `permalink_pattern` | `text` | `slug` \| `dated` \| `category-slug`, default `slug` |
| `created_at` | `timestamptz` | Auto-set on insert |
| `updated_at` | `timestamptz` | Updated by trigger on each change |

**Example row:**
```
id        = 'a1b2c3...'
hostname  = 'blog.dudiba.com'
name      = 'Dudiba Blog'
slug      = 'dudiba'
base_url  = 'https://blog.dudiba.com'
permalink_pattern = 'slug'
```

---

### `lp_users`

CMS admin users. These are independent from any application's own user table (e.g. dudiba's Supabase auth users).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated |
| `email` | `text` UNIQUE NOT NULL | Login email address |
| `password_hash` | `text` NOT NULL | bcrypt hash (cost 12) |
| `display_name` | `text` NOT NULL | Shown in admin UI |
| `role` | `text` NOT NULL | `superadmin` \| `admin` \| `author` (global role) |
| `avatar_url` | `text` | Optional profile image |
| `created_at` | `timestamptz` | Auto-set |
| `last_login_at` | `timestamptz` | Updated on each successful login |

**Role definitions:**

| Role | Capabilities |
|------|-------------|
| `superadmin` | Full access: manage all sites, all users, create new sites |
| `admin` | Full access within assigned sites: manage posts, users, settings for their site(s) |
| `author` | Can create and edit their own posts within assigned sites; cannot publish without admin approval |

---

### `lp_site_users`

Many-to-many: which users can access which sites, with an optional per-site role override.

| Column | Type | Description |
|--------|------|-------------|
| `site_id` | `uuid` FK → `lp_sites(id)` | |
| `user_id` | `uuid` FK → `lp_users(id)` | |
| `role` | `text` NOT NULL | Site-level role: `admin` \| `author` |

Primary key: `(site_id, user_id)`

The effective role for a user on a site is the **more permissive** of `lp_users.role` and `lp_site_users.role`. A `superadmin` does not need a `lp_site_users` row — they have access everywhere.

---

### `lp_sessions`

Managed automatically by `connect-pg-simple`. Do not modify directly.

| Column | Type | Description |
|--------|------|-------------|
| `sid` | `text` PK | Session ID (cookie value) |
| `sess` | `jsonb` NOT NULL | Serialized session data (`userId`, `siteId`, flash messages) |
| `expire` | `timestamptz` NOT NULL | Session expiry time |

Index: `lp_sessions(expire)` — used by the built-in session cleanup.

---

### `lp_posts`

The main content table. Stores both blog posts (`type = 'post'`) and static pages (`type = 'page'`).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated |
| `site_id` | `uuid` FK → `lp_sites(id)` ON DELETE CASCADE | |
| `author_id` | `uuid` FK → `lp_users(id)` ON DELETE SET NULL | |
| `type` | `text` NOT NULL | `post` \| `page`, default `post` |
| `slug` | `text` NOT NULL | URL slug, unique per site |
| `title` | `text` NOT NULL | Post title |
| `excerpt` | `text` | Optional short summary (used in post list cards) |
| `body` | `text` NOT NULL | Full HTML content from the Trix editor |
| `status` | `text` NOT NULL | `draft` \| `published` \| `private` \| `scheduled` |
| `featured_image_id` | `uuid` FK → `lp_media(id)` ON DELETE SET NULL | |
| `meta_title` | `text` | SEO: `<title>` tag override |
| `meta_description` | `text` | SEO: `<meta name="description">` content |
| `published_at` | `timestamptz` | When the post went/goes live |
| `scheduled_at` | `timestamptz` | For `scheduled` posts: when to auto-publish |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Updated by trigger |

**Unique constraint:** `(site_id, slug)` — the same slug can exist across different sites.

**Indexes:**
```sql
CREATE INDEX ON lp_posts (site_id, status, published_at DESC);
CREATE INDEX ON lp_posts (site_id, slug);
```

**Status state machine:**

```
draft ──────────────────► published
  │                           │
  └──► scheduled ──────────► │
             │                │
             ▼                ▼
           (background job publishes at scheduled_at)

published ──► private   (hidden from public, visible in admin)
```

---

### `lp_categories`

Hierarchical categories per site.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | |
| `site_id` | `uuid` FK → `lp_sites(id)` ON DELETE CASCADE | |
| `parent_id` | `uuid` FK → `lp_categories(id)` ON DELETE SET NULL | `null` = top-level category |
| `name` | `text` NOT NULL | Display name |
| `slug` | `text` NOT NULL | URL slug |
| `description` | `text` | Optional category description |

**Unique constraint:** `(site_id, slug)`

---

### `lp_tags`

Flat tags per site (no hierarchy).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | |
| `site_id` | `uuid` FK → `lp_sites(id)` ON DELETE CASCADE | |
| `name` | `text` NOT NULL | |
| `slug` | `text` NOT NULL | |

**Unique constraint:** `(site_id, slug)`

---

### `lp_post_categories`

Junction table linking posts to categories.

| Column | Type |
|--------|------|
| `post_id` | `uuid` FK → `lp_posts(id)` ON DELETE CASCADE |
| `category_id` | `uuid` FK → `lp_categories(id)` ON DELETE CASCADE |

Primary key: `(post_id, category_id)`

---

### `lp_post_tags`

Junction table linking posts to tags.

| Column | Type |
|--------|------|
| `post_id` | `uuid` FK → `lp_posts(id)` ON DELETE CASCADE |
| `tag_id` | `uuid` FK → `lp_tags(id)` ON DELETE CASCADE |

Primary key: `(post_id, tag_id)`

---

### `lp_media`

Uploaded files (images) per site.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | |
| `site_id` | `uuid` FK → `lp_sites(id)` ON DELETE CASCADE | |
| `uploaded_by` | `uuid` FK → `lp_users(id)` ON DELETE SET NULL | |
| `filename` | `text` NOT NULL | Original filename from the upload |
| `storage_path` | `text` NOT NULL | Absolute path on disk: `/uploads-data/dudiba/a1b2c3/photo.jpg` |
| `public_url` | `text` NOT NULL | URL served to browsers: `/uploads/dudiba/a1b2c3/photo.jpg` |
| `mime_type` | `text` NOT NULL | e.g. `image/jpeg`, `image/png`, `image/webp` |
| `file_size` | `integer` | Bytes |
| `width` | `integer` | Pixels (filled after upload processing) |
| `height` | `integer` | Pixels |
| `alt_text` | `text` | Accessibility alt text, editable in media library |
| `created_at` | `timestamptz` | |

---

## Entity Relationship Diagram

```
lp_sites
    │
    ├──< lp_site_users >── lp_users
    │                           │
    ├──< lp_posts ─────────────┘(author)
    │       │
    │       ├──< lp_post_categories >── lp_categories
    │       │                               (self-join parent_id)
    │       ├──< lp_post_tags >── lp_tags
    │       │
    │       └── lp_media (featured_image_id)
    │
    └──< lp_media (all site media)
```

---

## Running Migrations

Migrations are plain SQL files in `src/db/migrations/`. They are applied in filename order on every startup by `src/db/migrate.ts`. The migrator tracks which files have been applied in a `_lp_migrations` table.

```bash
# Apply pending migrations manually
npm run migrate

# Reset all CMS tables (destructive — dev only)
npm run migrate:reset
```

New migration files should be named `NNN_description.sql` where `NNN` increments from the last file (e.g. `002_add_post_revisions.sql`).

