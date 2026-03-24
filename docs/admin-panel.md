# Admin Panel

The LoomPress admin panel is a server-rendered web interface for managing blog content. It is accessible at `/admin` on any domain that points to the LoomPress instance.

---

## Access

| URL | Who can access |
|-----|---------------|
| `cms.tagna.in/admin/login` | Anyone (then auth gated) |
| `blog.dudiba.com/admin/login` | Same — the admin is on every hostname |
| `cms.tagna.in/admin/sites` | Superadmin only |

After login, the admin is the same regardless of which hostname you reached it from.

---

## Authentication

### Login
`GET /admin/login` → renders the login form
`POST /admin/login` → validates email + bcrypt password, sets `req.session.userId`, redirects

If login fails, a flash error message is shown on the login form. The `last_login_at` field in `cms_users` is updated on success.

### Session
Sessions are stored in the `cms_sessions` table. The session cookie (`loompress.sid`) is:
- HttpOnly
- Secure in production (HTTPS only)
- SameSite: Lax
- Expires after 30 days of inactivity

### Logout
`POST /admin/logout` → destroys the session, redirects to `/admin/login`

### Guards
Two Express middleware functions protect admin routes:

```typescript
requireAuth       // Redirects to /admin/login if no valid session
requireSiteAccess // Returns 403 if user is not associated with req.session.siteId
```

Every admin route (except `/admin/login`) is wrapped with `requireAuth`. Routes that operate on site content are additionally wrapped with `requireSiteAccess`.

---

## Site Switching (Superadmin)

After a superadmin logs in, `req.session.siteId` is not set. They are redirected to `/admin/sites` to pick a site. Clicking a site row POSTs to `/admin/switch-site` with the `siteId`, which stores it in the session and redirects to `/admin/posts`.

The current site name is shown in the admin sidebar header. A "Switch Site" link is always visible for superadmins.

Regular admins are automatically scoped to their site at login — no picker is shown.

---

## Routes Reference

### Auth
```
GET  /admin/login        Login form
POST /admin/login        Submit credentials
POST /admin/logout       End session
```

### Posts
```
GET  /admin/posts                  Post list (paginated, 20/page)
GET  /admin/posts?page=2           Page 2
GET  /admin/posts?status=draft     Filter by status (draft|published|scheduled|private)
GET  /admin/posts/new              Create form
POST /admin/posts/new              Submit new post → redirect to edit view
GET  /admin/posts/:id/edit         Edit form (pre-populated)
POST /admin/posts/:id/edit         Submit update → redirect back to edit
POST /admin/posts/:id/publish      Set status = 'published', published_at = now()
POST /admin/posts/:id/unpublish    Set status = 'draft'
POST /admin/posts/:id/delete       Delete post + remove category/tag relations
```

### Media
```
GET  /admin/media              Media library (CSS grid, newest first)
POST /admin/media/upload       Upload file (multipart/form-data, field: 'file')
POST /admin/media/:id/delete   Delete file from disk and database
PATCH /admin/media/:id         Update alt_text (JSON body: { altText: string })
```

### Categories
```
GET  /admin/categories            List all categories for current site
GET  /admin/categories/new        Create form
POST /admin/categories/new        Submit → redirect
GET  /admin/categories/:id/edit   Edit form
POST /admin/categories/:id/edit   Update → redirect
POST /admin/categories/:id/delete Delete (not allowed if posts are associated)
```

### Tags
Same pattern as categories:
```
GET/POST /admin/tags
GET/POST /admin/tags/new
GET/POST /admin/tags/:id/edit
POST     /admin/tags/:id/delete
```

### Sites (superadmin only)
```
GET  /admin/sites            List all sites
GET  /admin/sites/new        Create site form
POST /admin/sites/new        Submit → redirect
GET  /admin/sites/:id/edit   Edit site settings
POST /admin/sites/:id/edit   Update → redirect
POST /admin/switch-site      Set req.session.siteId → redirect to /admin/posts
```

### Users
```
GET  /admin/users              List users for current site
GET  /admin/users/new          Invite user form
POST /admin/users/new          Create user + site association
GET  /admin/users/:id/edit     Edit user role
POST /admin/users/:id/edit     Update role
POST /admin/users/:id/delete   Remove from site (does not delete the user record)
```

---

## Post Editor

The post editor at `/admin/posts/new` and `/admin/posts/:id/edit` uses the [Trix](https://trix-editor.org/) rich text editor.

### What Trix provides out of the box
- Bold, italic, underline, strikethrough
- Headings (h1–h2)
- Blockquotes
- Ordered and unordered lists
- Code blocks
- Links (with URL editing)
- File attachments (images — these go through Trix's own attachment handling, separate from the media library)

### Form fields in the post editor
| Field | Input type | Notes |
|-------|-----------|-------|
| Title | `<input type="text">` | Required |
| Slug | `<input type="text">` | Auto-generated from title if left blank; unique per site |
| Excerpt | `<textarea>` | Optional short summary |
| Body | Trix `<trix-editor>` | Full post content; submitted as hidden `<input>` |
| Featured image | Hidden input + media picker button | Opens media library modal |
| Categories | Checkboxes | All categories for the current site |
| Tags | Tag input (comma-separated or autocomplete) | Creates new tags on submit if they don't exist |
| Status | Radio: draft / published / scheduled / private | |
| Publish date | `<input type="datetime-local">` | Required if status = scheduled |
| Meta title | `<input type="text">` | SEO title, defaults to post title |
| Meta description | `<textarea>` | SEO description |

### Slug generation
If the slug field is blank when the form is submitted, the controller generates a slug from the title using `slugify(title)` and checks for uniqueness. If the slug exists, a numeric suffix is appended (`my-post-2`, `my-post-3`, etc.).

---

## Media Library

The media library at `/admin/media` shows all uploaded images for the current site in a CSS grid (newest first).

### Uploading
- Drag-and-drop zone at the top of the library page
- Standard file `<input type="file">` fallback
- Allowed types: JPEG, PNG, WebP, GIF
- Max size: 20 MB per file (configurable in `.env`)
- Files are stored at `/uploads-data/{site.slug}/{uuid}/{filename}`
- The public URL `/uploads/{site.slug}/{uuid}/{filename}` is stored in `cms_media.public_url`

### Selecting a featured image
In the post editor, clicking "Set featured image" opens a modal overlay that renders the media library. Clicking an image in the modal sets the hidden `featured_image_id` input and shows a thumbnail preview next to the button.

### Alt text
Each media item has an editable alt text field. Clicking the alt text in the library sends a PATCH to `/admin/media/:id` (JSON) and updates inline without a page reload.

---

## Admin UI Stack

| Concern | Implementation |
|---------|---------------|
| Templates | Nunjucks (`.njk` files in `src/admin/views/`) |
| Layout | `layout.njk` — fixed left sidebar, scrollable main area |
| Styling | `admin.css` — plain CSS, ~400 lines, CSS custom properties for theme |
| Rich text | Trix editor from CDN |
| Flash messages | `flashMiddleware()` from `@tagna/udiot/server` |
| CSRF protection | `csrfMiddleware()` from `@tagna/udiot/server`, `_csrf` hidden input in every form |
| Pagination | Offset-based: `LIMIT 20 OFFSET (page-1)*20` |

There is **no client-side JavaScript framework** in the admin panel. All interactivity is handled by:
- Native HTML form submission (POST/redirect/GET pattern)
- A small inline `<script>` for the Trix editor initialization
- A small inline `<script>` for the media picker modal (vanilla JS, ~50 lines)

---

## Template Structure

```
src/admin/views/
├── layout.njk          Base layout: <html>, sidebar nav, flash zone, content block
├── login.njk           Standalone login page (no sidebar)
├── dashboard.njk       Stats: total posts, draft count, recent activity
├── posts/
│   ├── list.njk        Table of posts with status badges and action links
│   └── edit.njk        Create + edit (same template; {{post}} is null on create)
├── media/
│   └── library.njk     CSS grid of images; upload form at top
├── categories/
│   ├── list.njk        Table with parent column and post count
│   └── edit.njk        Name + slug + parent dropdown + description
├── tags/
│   ├── list.njk        Table with post count
│   └── edit.njk        Name + slug
├── sites/
│   ├── list.njk        Table of all sites (superadmin)
│   └── edit.njk        Hostname, name, slug, base_url, timezone, permalink pattern
└── users/
    ├── list.njk        Table of site users with roles
    └── edit.njk        Email, display name, role selector
```
