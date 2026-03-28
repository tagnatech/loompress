# Plugin Support

LoomPress can load external plugins at runtime. A plugin is a JavaScript module on disk that exports a single object.

## What Plugins Can Do

- Run startup code during app boot
- Register extra admin routes under `/admin/*`
- Register extra public routes before the blog catch-all route
- Add admin sidebar links
- Provide extra admin Nunjucks view directories
- Serve plugin-owned static assets

This is intentionally smaller than WordPress-style plugin APIs. Plugins get stable route and service hooks without overriding core admin templates by default.

## Configuration

Two environment variables control loading:

```env
PLUGINS_DIR=./plugins
# Optional explicit list. When set, auto-discovery is skipped.
PLUGINS=./plugins/my-plugin,./plugins/another-plugin
```

Behavior:

1. If `PLUGINS` is set, LoomPress loads exactly those files or directories.
2. Otherwise it scans `PLUGINS_DIR` and loads each child plugin directory or file.

Recognized entry filenames inside a plugin directory:

- `loompress.plugin.js`
- `loompress.plugin.mjs`
- `loompress.plugin.cjs`
- `index.js`
- `index.mjs`
- `index.cjs`
- `dist/index.js`
- `dist/index.mjs`
- `dist/index.cjs`

## Plugin Shape

```js
export default {
  name: 'Example Plugin',
  admin: {
    viewsDir: './admin/views',
    navItems: [
      {
        label: 'Example',
        href: '/admin/plugins/example',
        activeNav: 'example-plugin',
      },
    ],
  },
  staticDir: './static',
  setup(ctx) {
    ctx.logger.info('plugin booted');
  },
  registerAdminRoutes({ router, auth, plugin }) {
    router.get('/plugins/example', auth.requireAuth(), (req, res) => {
      res.render('plugins/example/index', {
        title: 'Example Plugin',
        activeNav: plugin.slug,
        plugin,
      });
    });
  },
  registerPublicRoutes({ router, plugin }) {
    router.get('/plugin-demo', (req, res) => {
      res.json({
        plugin: plugin.name,
        site: req.site?.slug ?? null,
      });
    });
  },
};
```

## Context Object

Every hook receives a context object with:

- `app`: the Express app
- `config`: typed LoomPress config
- `pool`: PostgreSQL pool
- `upload`: configured multer instance
- `services`: the built-in service instances
- `auth`: bound auth helpers for admin routes
- `plugin`: resolved plugin metadata
- `logger`: console logger prefixed with the plugin slug

Route hooks also receive:

- `router`: the shared Express router for that surface

### `auth` helpers

- `auth.requireAuth()`
- `auth.requireSiteAccess()`
- `auth.requireRole(...roles)`
- `auth.requireSiteRole(...roles)`

These are already bound to the current app's database pool, so plugin code does not need to construct them manually.

## Admin Views

If `admin.viewsDir` is set, LoomPress adds that directory to the Nunjucks search path for admin rendering. Core admin templates still win on name collisions because built-in view directories are registered first.

For plugin templates, prefer namespaced paths such as:

```text
plugins/my-plugin/index
```

## Static Assets

If `staticDir` is set, LoomPress serves it at:

```text
/plugins-static/<plugin-slug>
```

Example:

```text
/plugins-static/hello-world/hello-world.css
```

## Route Ordering

- Admin plugin routes are mounted after the built-in admin router.
- Public plugin routes are mounted before the built-in blog router.

That means a public plugin can claim a custom path before the blog's `/:slug` route. Avoid mounting public routes that collide with core paths such as `/feed.xml`, `/search`, or `/comment`.

## Example Plugin

A working sample lives at:

- `examples/plugins/hello-world/index.mjs`

LoomPress ships with bundled plugins at:

- `plugins/seo-foundation/index.mjs`
- `plugins/ai-autoblog/index.mjs`

Because the default plugin scan path is `./plugins`, these are auto-discovered without any extra configuration unless you override `PLUGINS` or `PLUGINS_DIR`.

### `AI Autoblog`

`AI Autoblog` adds a site-scoped admin page at `/admin/plugins/ai-autoblog` where site admins can:

- Configure OpenRouter text and image model IDs
- Store an API key in site settings or rely on `OPENROUTER_API_KEY`
- Define the content brief, audience, brand voice, categories, and keyword targets
- Schedule recurring post generation in the site timezone
- Trigger an immediate run for validation

Each run uses three model passes:

1. Strategy agent
2. Writer agent
3. Editor agent

The plugin saves ordinary LoomPress posts with excerpt, category, tags, meta title, meta description, and an optional generated featured image written into the media library.

To try it locally:

```env
PLUGINS=./examples/plugins/hello-world
```

Then start LoomPress and visit:

- `/admin/plugins/hello-world`
- `/plugin-demo`
