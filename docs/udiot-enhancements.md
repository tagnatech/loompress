# udiot Enhancements

LoomPress requires capabilities that were not present in `@tagna/udiot` at the time it was built: a server-side HTML template engine, session management backed by Postgres, file upload middleware, flash messages, and CSRF protection. These were added as a new `./server` export module inside the udiot framework itself, making them reusable for any future udiot-based server-rendered application.

All additions live at `/w/Projects/udiot/src/server/` and are exported via the `@tagna/udiot/server` import path.

---

## New Export: `@tagna/udiot/server`

Added to `/w/Projects/udiot/package.json`:

```json
{
  "exports": {
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.js"
    }
  }
}
```

Usage in LoomPress:

```typescript
import {
  createNunjucksEngine,
  createSessionMiddleware,
  createUploadMiddleware,
  flashMiddleware,
  csrfMiddleware,
} from '@tagna/udiot/server';
```

---

## Modules

### `template-engine.ts`

**Purpose:** Provides a Nunjucks-based server-side template engine integrated with Express `res.render()`.

**Export:**
```typescript
export function createNunjucksEngine(
  viewsDir: string,
  options?: nunjucks.ConfigureOptions
): NunjucksEngine;

export interface NunjucksEngine {
  /** Register with an Express app: app.engine('njk', ...) + app.set('view engine', 'njk') */
  express(app: express.Application): void;
  /** Render a template string directly (useful for RSS/sitemap XML) */
  render(template: string, context: Record<string, unknown>): string;
  /** Add a global variable available in all templates */
  addGlobal(name: string, value: unknown): void;
  /** Add a custom filter: {{ value | filterName }} */
  addFilter(name: string, fn: (...args: unknown[]) => unknown): void;
}
```

**Built-in global helpers (available in all templates without import):**

| Helper | Usage | Description |
|--------|-------|-------------|
| `formatDate` | `{{ post.published_at \| formatDate('DD MMM YYYY') }}` | Date formatting |
| `truncate` | `{{ post.excerpt \| truncate(150) }}` | Truncate string with ellipsis |
| `slugify` | `{{ name \| slugify }}` | Convert string to URL slug |
| `nl2br` | `{{ text \| nl2br }}` | Convert newlines to `<br>` tags |
| `ago` | `{{ post.published_at \| ago }}` | Relative time: "3 days ago" |

**Example:**
```typescript
// src/server.ts
const engine = createNunjucksEngine(path.join(__dirname, 'admin/views'), {
  autoescape: true,
  throwOnUndefined: false,
  noCache: process.env.NODE_ENV !== 'production',
});
engine.express(app);
```

```njk
{# admin/views/posts/list.njk #}
{% extends "../layout.njk" %}
{% block content %}
  <h1>Posts</h1>
  {% for post in posts %}
    <tr>
      <td>{{ post.title }}</td>
      <td>{{ post.published_at | formatDate('DD MMM YYYY') }}</td>
    </tr>
  {% else %}
    <tr><td colspan="3">No posts yet.</td></tr>
  {% endfor %}
{% endblock %}
```

---

### `session.ts`

**Purpose:** Creates an Express session middleware backed by a PostgreSQL session store. Sessions persist across process restarts. The `cms_sessions` table is created automatically by `connect-pg-simple` on first run.

**Export:**
```typescript
export interface SessionOptions {
  secret: string;               // Required: session signing secret (from env)
  pgPool: Pool;                 // Required: node-postgres Pool instance
  cookieName?: string;          // Default: 'loompress.sid'
  secure?: boolean;             // Default: true in production, false in dev
  maxAgeDays?: number;          // Default: 30
  sameSite?: 'lax' | 'strict' | 'none'; // Default: 'lax'
}

export function createSessionMiddleware(options: SessionOptions): express.RequestHandler;
```

**Usage:**
```typescript
import { Pool } from 'pg';
import { createSessionMiddleware } from '@tagna/udiot/server';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(createSessionMiddleware({
  secret: process.env.SESSION_SECRET,
  pgPool: pool,
  secure: process.env.NODE_ENV === 'production',
}));
```

**Session data shape** (stored in `cms_sessions.sess`):
```typescript
declare module 'express-session' {
  interface SessionData {
    userId: string;       // Logged-in user's ID
    siteId: string;       // Currently selected site ID
    flash: {              // Flash messages (cleared after one read)
      success?: string;
      error?: string;
      info?: string;
    };
  }
}
```

---

### `flash.ts`

**Purpose:** Attaches `req.flash()` to write a one-time message and `res.locals.flash` to read it in templates. Messages survive exactly one redirect.

**Export:**
```typescript
export function flashMiddleware(): express.RequestHandler;
```

**Usage in controllers:**
```typescript
// Write a flash message (before redirect)
req.flash('success', 'Post published successfully.');
res.redirect('/admin/posts');

// Write an error flash
req.flash('error', 'Slug already exists for this site.');
res.redirect('back');
```

**Usage in Nunjucks templates:**
```njk
{# layout.njk — shown in the base layout so every page can display flashes #}
{% if flash.success %}
  <div class="alert alert--success">{{ flash.success }}</div>
{% endif %}
{% if flash.error %}
  <div class="alert alert--error">{{ flash.error }}</div>
{% endif %}
```

---

### `upload.ts`

**Purpose:** Creates a configured `multer` instance for handling file uploads. Uses disk storage with UUID-based subdirectories to prevent filename collisions and path traversal.

**Export:**
```typescript
export interface UploadOptions {
  destDir: string;              // Base directory: '/app/uploads-data'
  maxFileSizeMb?: number;       // Default: 10
  allowedMimeTypes?: string[];  // Default: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  subDirFn?: (req: express.Request) => string; // Default: () => req.site.slug
}

export function createUploadMiddleware(options: UploadOptions): multer.Multer;
```

**Storage path structure:**
```
/uploads-data/
  dudiba/          ← site slug (from req.site.slug)
    a1b2c3d4/      ← UUID generated per upload
      photo.jpg    ← original filename (sanitized)
```

This structure ensures:
- Files from different sites never collide
- The same filename can be uploaded multiple times without conflict
- Deleting a site's uploads is as simple as `rm -rf /uploads-data/{slug}/`

**Usage:**
```typescript
// src/uploads/middleware.ts
const upload = createUploadMiddleware({
  destDir: config.uploadDir,
  maxFileSizeMb: 20,
});

// In the media upload route:
router.post('/admin/media/upload',
  requireAuth,
  upload.single('file'),      // multer processes multipart/form-data
  mediaController.upload
);
```

---

### `csrf.ts`

**Purpose:** Protects all state-changing admin form submissions (POST, PUT, DELETE) from Cross-Site Request Forgery attacks using the synchronizer token pattern.

**Export:**
```typescript
export function csrfMiddleware(): {
  protect: express.RequestHandler;   // Verifies token on state-changing requests
  token: express.RequestHandler;     // Adds req.csrfToken() helper for forms
};
```

**How it works:**
1. On GET requests, a CSRF token is generated and stored in the session.
2. The token is made available in templates via `res.locals.csrfToken`.
3. On POST/DELETE requests, the submitted `_csrf` field is compared to the session token.
4. If they don't match, a 403 is returned.

**Usage in templates:**
```njk
<form method="POST" action="/admin/posts/new">
  <input type="hidden" name="_csrf" value="{{ csrfToken }}">
  <!-- rest of form -->
</form>
```

---

## Why These Were Added to udiot (not LoomPress)

These utilities (session management, template engines, file uploads, CSRF) are general-purpose server-side web application concerns. They are not specific to blogging. Any future udiot-based server-rendered application would need the same building blocks.

Adding them to `@tagna/udiot/server` keeps LoomPress's `src/` focused on business logic, and makes the framework genuinely capable of building full-stack server-rendered applications — consistent with the existing `@tagna/udiot/ssg` and `@tagna/udiot/node` exports.

Future udiot apps that need server rendering should import from `@tagna/udiot/server` rather than installing `express-session`, `nunjucks`, and `multer` independently.
