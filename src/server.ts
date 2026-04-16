import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { createNunjucksEngine, flashMiddleware, csrfMiddleware } from '@tagna/udiot/server';
import { getBasePath, getRequestBasePath, prefixBasePath, prefixBasePathInHtml } from './base-path.js';
import { getConfigPresence, loadConfig } from './config/index.js';
import { loadEnvFile } from './config/env-file.js';
import { getDatabaseClient } from './db/client.js';
import { SiteResolver } from './multi-site/resolver.js';
import { siteMiddleware } from './multi-site/middleware.js';
import { requireAuth, requireRole, requireSiteAccess, requireSiteRole } from './auth/middleware.js';
import { setupSession } from './auth/session.js';
import { setupUpload } from './uploads/middleware.js';
import { SiteService } from './services/SiteService.js';
import { UserService } from './services/UserService.js';
import { PostService } from './services/PostService.js';
import { CategoryService } from './services/CategoryService.js';
import { TagService } from './services/TagService.js';
import { MediaService } from './services/MediaService.js';
import { CommentService } from './services/CommentService.js';
import { SettingsService } from './services/SettingsService.js';
import { SearchService } from './services/SearchService.js';
import { MenuService } from './services/MenuService.js';
import { createInstallerRouter } from './installer/router.js';
import { createOnboardingRouter } from './onboarding/router.js';
import { createAdminRouter } from './admin/router.js';
import { createBlogRouter } from './public/router.js';
import { getThemeViewsDir, getAllThemeViewsDirs, isAvailableTheme, sanitizeThemeName } from './public/theme-resolver.js';
import { startScheduler } from './scheduler.js';
import { securityHeaders } from './middleware/security.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { getBrandHeadHtml } from './branding/head.js';
import { getSiteFaviconUrl, getSiteLogoUrl } from './branding/site-logo.js';
import { loadPlugins } from './plugins/loader.js';
import { getVisiblePluginAdminNavItems } from './plugins/runtime.js';
import type { LoadedPlugin, LoomPressPluginContext, LoomPressServices } from './plugins/types.js';
import { sanitizeCustomCss } from './utils/validation.js';
import { ensureAssetsDirectories } from './assets/directories.js';

// Import types for augmentation
import './multi-site/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let configuredApp: express.Express | null = null;
let configuredAppPromise: Promise<express.Express> | null = null;
let schedulerHandle: NodeJS.Timeout | null = null;

function isHtmlLikeResponse(contentType: string, body: string): boolean {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes('text/html') || normalizedType.includes('application/xhtml+xml')) {
    return true;
  }

  return /^\s*(?:<!doctype html\b|<html\b|<head\b|<body\b|<h1\b|<div\b|<form\b)/i.test(body);
}

function installBasePathSupport(app: express.Express, fallbackBasePath: string): void {
  app.use((req, res, next) => {
    const trustProxy = req.app.get('trust proxy');
    const basePath = trustProxy ? getRequestBasePath(req, fallbackBasePath) : fallbackBasePath;
    res.locals.basePath = basePath;

    const originalRedirect = res.redirect.bind(res);
    res.redirect = ((statusOrUrl: number | string, maybeUrl?: string) => {
      if (typeof statusOrUrl === 'number') {
        return originalRedirect(statusOrUrl, prefixBasePath(maybeUrl ?? '', basePath));
      }

      return originalRedirect(prefixBasePath(statusOrUrl, basePath));
    }) as typeof res.redirect;

    const originalSend = res.send.bind(res);
    res.send = ((body?: any) => {
      if (typeof body === 'string' && isHtmlLikeResponse(String(res.getHeader('Content-Type') ?? ''), body)) {
        return originalSend(prefixBasePathInHtml(body, basePath));
      }

      return originalSend(body);
    }) as typeof res.send;

    next();
  });
}

async function createConfiguredApp(): Promise<express.Express> {
  loadEnvFile();
  const config = loadConfig();
  const plugins = await loadPlugins({
    pluginsDir: config.pluginsDir,
    pluginEntries: config.pluginEntries,
  });
  const db = await getDatabaseClient(config.databaseUrl);
  const pool = db as unknown as pg.Pool;

  await db.query('SELECT 1');
  const sessionPool = new pg.Pool({ connectionString: config.databaseUrl });

  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.locals.basePath = config.basePath;
  ensureAssetsDirectories(config.assetsDir);
  installBasePathSupport(app, config.basePath);

  app.locals.db = db;
  app.locals.pool = pool;
  app.locals.plugins = plugins.map(plugin => plugin.descriptor);

  const adminViewsDir = path.join(__dirname, 'admin', 'views');
  const pluginAdminViewsDirs = plugins.flatMap(plugin => (
    plugin.descriptor.adminViewsDir ? [plugin.descriptor.adminViewsDir] : []
  ));
  const allThemeDirs = getAllThemeViewsDirs();
  const viewsDirs = [adminViewsDir, ...pluginAdminViewsDirs, ...allThemeDirs];

  const engine = createNunjucksEngine(viewsDirs, {
    autoescape: true,
    throwOnUndefined: false,
    noCache: config.isDev,
  });
  engine.express(app);

  app.use(securityHeaders());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.locals.defaultSiteLogoUrl = getSiteLogoUrl(null);
    res.locals.defaultSiteFaviconUrl = getSiteFaviconUrl(null);
    res.locals.defaultBrandHeadHtml = getBrandHeadHtml(null);
    res.locals.brandHeadHtml = getBrandHeadHtml(null);
    next();
  });

  app.use('/admin/css', express.static(path.join(__dirname, 'admin', 'public', 'css'), {
    index: false,
    maxAge: config.isProd ? '1d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/core-assets', express.static(path.join(__dirname, 'admin', 'public', 'assets'), {
    index: false,
    immutable: config.isProd,
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use(express.static(path.join(__dirname, 'assets', 'images', 'brand'), {
    dotfiles: 'deny',
    index: false,
    immutable: config.isProd,
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/assets', express.static(config.assetsDir, {
    dotfiles: 'deny',
    index: false,
    immutable: config.isProd,
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/uploads', express.static(config.uploadDir, {
    dotfiles: 'deny',
    index: false,
    immutable: config.isProd,
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('Cache-Control', config.isProd ? 'public, max-age=604800, immutable' : 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  for (const plugin of plugins) {
    if (!plugin.descriptor.staticDir || !plugin.descriptor.staticMountPath) {
      continue;
    }

    app.use(plugin.descriptor.staticMountPath, express.static(plugin.descriptor.staticDir, {
      index: false,
      maxAge: config.isProd ? '1d' : 0,
      setHeaders: res => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }));
  }

  app.use(setupSession(sessionPool, config.sessionSecret, config.isProd));
  app.use(flashMiddleware());

  const csrf = csrfMiddleware({
    exclude: [
      '/health',
      '/api/webhooks/*',
      '/onboarding',
      '/admin/media/upload',
      '/admin/sites/new',
      '/admin/sites/*/edit',
    ],
  });
  app.use(csrf.token);
  app.use(csrf.protect);

  const upload = setupUpload(config);

  const siteService = new SiteService(pool);
  const userService = new UserService(pool);
  const postService = new PostService(pool);
  const categoryService = new CategoryService(pool);
  const tagService = new TagService(pool);
  const mediaService = new MediaService(pool);
  const commentService = new CommentService(pool);
  const settingsService = new SettingsService(pool);
  const searchService = new SearchService(pool);
  const menuService = new MenuService(pool);
  const services: LoomPressServices = {
    siteService,
    userService,
    postService,
    categoryService,
    tagService,
    mediaService,
    commentService,
    settingsService,
    searchService,
    menuService,
  };

  const loginRateLimit = createRateLimit({
    keyPrefix: 'login',
    maxRequests: config.loginRateLimitMax,
    windowMs: config.loginRateLimitWindowMs,
    message: 'Too many login attempts. Please try again later.',
  });
  const commentRateLimit = createRateLimit({
    keyPrefix: 'comment',
    maxRequests: config.commentRateLimitMax,
    windowMs: config.commentRateLimitWindowMs,
    message: 'Too many comments submitted from this IP. Please wait and try again.',
  });

  const createPluginLogger = (plugin: LoadedPlugin) => ({
    info: (...args: unknown[]) => console.log(`[plugin:${plugin.descriptor.slug}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[plugin:${plugin.descriptor.slug}]`, ...args),
    error: (...args: unknown[]) => console.error(`[plugin:${plugin.descriptor.slug}]`, ...args),
  });
  const createPluginContext = (plugin: LoadedPlugin): LoomPressPluginContext => ({
    app,
    config,
    pool,
    upload,
    services,
    auth: {
      requireAuth,
      requireSiteAccess: () => requireSiteAccess(pool),
      requireRole,
      requireSiteRole: (...roles: string[]) => requireSiteRole(pool, ...roles),
    },
    plugin: plugin.descriptor,
    logger: createPluginLogger(plugin),
  });
  const runPluginHook = async (
    plugin: LoadedPlugin,
    hookName: 'setup' | 'registerAdminRoutes' | 'registerPublicRoutes',
    callback: (() => void | Promise<void>) | undefined,
  ) => {
    if (!callback) {
      return;
    }

    try {
      await callback();
    } catch (err) {
      console.error(`Plugin "${plugin.descriptor.name}" failed during ${hookName}:`, err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  };

  for (const plugin of plugins) {
    await runPluginHook(
      plugin,
      'setup',
      plugin.definition.setup
        ? () => plugin.definition.setup!(createPluginContext(plugin))
        : undefined,
    );
  }

  app.use(createOnboardingRouter({ pool, siteService, userService, upload }));

  const siteResolver = new SiteResolver(pool);
  app.use(siteMiddleware(siteResolver));

  if (schedulerHandle) {
    clearInterval(schedulerHandle);
  }
  schedulerHandle = startScheduler(postService);

  app.use('/admin', async (req, res, next) => {
    try {
      if (req.session?.userId) {
        const user = await userService.getById(req.session.userId);
        res.locals.currentUser = user;
      }
      if (req.session?.siteId) {
        const rawSite = await siteService.getById(req.session.siteId);
        const site = rawSite
          ? { ...rawSite, custom_css: sanitizeCustomCss(rawSite.custom_css) ?? null }
          : rawSite;
        req.site = site;
        res.locals.currentSite = site;
        res.locals.brandHeadHtml = getBrandHeadHtml(site?.logo_url);
        if (req.session.userId) {
          const user = res.locals.currentUser ?? await userService.getById(req.session.userId);
          res.locals.currentSiteRole = user?.role === 'superadmin'
            ? 'superadmin'
            : await userService.getSiteRole(req.session.userId, req.session.siteId);
        }
      }

      res.locals.pluginAdminNavItems = await getVisiblePluginAdminNavItems(plugins, {
        req,
        res,
        currentUser: res.locals.currentUser ?? null,
        currentSite: res.locals.currentSite ?? null,
        currentSiteRole: res.locals.currentSiteRole ?? null,
      });

      next();
    } catch (err) {
      next(err);
    }
  });

  const adminRouter = createAdminRouter({
    pool,
    postService,
    categoryService,
    tagService,
    mediaService,
    siteService,
    userService,
    commentService,
    settingsService,
    menuService,
    upload,
  });
  const pluginAdminRouter = express.Router();
  const pluginPublicRouter = express.Router();

  for (const plugin of plugins) {
    await runPluginHook(
      plugin,
      'registerAdminRoutes',
      plugin.definition.registerAdminRoutes
        ? () => plugin.definition.registerAdminRoutes!({
          ...createPluginContext(plugin),
          router: pluginAdminRouter,
        })
        : undefined,
    );
    await runPluginHook(
      plugin,
      'registerPublicRoutes',
      plugin.definition.registerPublicRoutes
        ? () => plugin.definition.registerPublicRoutes!({
          ...createPluginContext(plugin),
          router: pluginPublicRouter,
        })
        : undefined,
    );
  }

  app.use('/admin/login', (req, res, next) => (
    req.method === 'POST' ? loginRateLimit(req, res, next) : next()
  ));
  app.use('/admin', adminRouter);
  app.use('/admin', pluginAdminRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/admin')) {
      return next();
    }

    const originalRender = res.render.bind(res);
    res.render = function render(view: string, options?: any, callback?: any) {
      const site = req.site;
      if (site) {
        const resolvedSite = { ...site, logo_url: getSiteLogoUrl(site.logo_url) };
        const requestedPreviewTheme = typeof req.query.theme_preview === 'string'
          ? sanitizeThemeName(req.query.theme_preview)
          : null;
        const previewTheme = (
          requestedPreviewTheme
          && req.session?.siteId === resolvedSite.id
          && isAvailableTheme(requestedPreviewTheme)
        )
          ? requestedPreviewTheme
          : null;
        const themeName = previewTheme || resolvedSite.theme || 'default';
        const themeDir = getThemeViewsDir(themeName);
        const context = {
          ...res.locals,
          ...options,
          brandHeadHtml: getBrandHeadHtml(site.logo_url),
          site: {
            ...resolvedSite,
            favicon_url: getSiteFaviconUrl(site.logo_url),
          },
          previewTheme,
          currentTheme: themeName,
        };

        engine.renderFrom(themeDir, `${view}.njk`, context, (err, result) => {
          if (err) {
            if (callback) {
              return callback(err);
            }
            return next(err);
          }
          res.send(result);
        });
        return;
      }

      originalRender(view, options, callback);
    } as typeof res.render;
    next();
  });

  const blogRouter = createBlogRouter({
    postService,
    categoryService,
    tagService,
    searchService,
    commentService,
    settingsService,
    menuService,
  });
  app.use('/comment', (req, res, next) => (
    req.method === 'POST' ? commentRateLimit(req, res, next) : next()
  ));
  app.use('/', pluginPublicRouter);
  app.use('/', blogRouter);

  app.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', uptime: process.uptime() });
    } catch {
      res.status(503).json({ status: 'error', db: 'failed' });
    }
  });

  app.use((_req, res) => {
    res.status(404).send('<h1>404 — Page Not Found</h1>');
  });

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    const uploadMessage = err?.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded file is too large.'
      : (typeof err?.message === 'string' && err.message.includes('File type')
        ? err.message
        : null);

    if (uploadMessage) {
      if (req.path === '/onboarding') {
        req.flash('error', uploadMessage);
        return res.redirect('/onboarding');
      }
      if (req.baseUrl === '/admin' && req.path.startsWith('/sites')) {
        req.flash('error', uploadMessage);
        return res.redirect(req.originalUrl);
      }
    }

    if (err?.code === 'LIMIT_FILE_SIZE') {
      if (req.path === '/media/upload' && req.baseUrl === '/admin') {
        req.flash('error', 'Uploaded file is too large.');
        return res.redirect('/admin/media');
      }
      return res.status(400).send('Uploaded file is too large.');
    }
    if (typeof err?.message === 'string' && err.message.includes('File type')) {
      if (req.path === '/media/upload' && req.baseUrl === '/admin') {
        req.flash('error', err.message);
        return res.redirect('/admin/media');
      }
      return res.status(400).send(err.message);
    }
    res.status(500).send(config.isDev ? `<pre>${err.stack}</pre>` : '<h1>Internal Server Error</h1>');
  });

  console.log('Configured LoomPress application initialized.');
  if (plugins.length > 0) {
    console.log(`Loaded plugins: ${plugins.map(plugin => plugin.descriptor.name).join(', ')}`);
  }

  return app;
}

async function ensureConfiguredApp(): Promise<express.Express> {
  if (configuredApp) {
    return configuredApp;
  }

  if (!configuredAppPromise) {
    configuredAppPromise = createConfiguredApp()
      .then(app => {
        configuredApp = app;
        return app;
      })
      .catch(err => {
        configuredApp = null;
        configuredAppPromise = null;
        throw err;
      });
  }

  return configuredAppPromise;
}

function resetConfiguredApp(): void {
  configuredApp = null;
  configuredAppPromise = null;
}

function renderBootError(res: express.Response, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const isDev = (process.env.NODE_ENV ?? 'development') === 'development';
  const message = '<h1>LoomPress Could Not Start</h1><p>Check the database connection and server configuration.</p>';

  res.status(503).send(isDev ? `<pre>${error.stack ?? error.message}</pre>` : message);
}

function createBootstrapApp(): express.Express {
  const app = express();
  const adminViewsDir = path.join(__dirname, 'admin', 'views');
  const assetsDir = path.resolve(process.env.ASSETS_DIR ?? './assets');
  const basePath = getBasePath();
  ensureAssetsDirectories(assetsDir);
  app.locals.basePath = basePath;
  installBasePathSupport(app, basePath);
  const engine = createNunjucksEngine([adminViewsDir], {
    autoescape: true,
    throwOnUndefined: false,
    noCache: (process.env.NODE_ENV ?? 'development') !== 'production',
  });
  engine.express(app);

  app.use('/admin/css', express.static(path.join(__dirname, 'admin', 'public', 'css'), {
    index: false,
    maxAge: (process.env.NODE_ENV ?? 'development') === 'production' ? '1d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/core-assets', express.static(path.join(__dirname, 'admin', 'public', 'assets'), {
    index: false,
    immutable: (process.env.NODE_ENV ?? 'development') === 'production',
    maxAge: (process.env.NODE_ENV ?? 'development') === 'production' ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use(express.static(path.join(__dirname, 'assets', 'images', 'brand'), {
    dotfiles: 'deny',
    index: false,
    immutable: (process.env.NODE_ENV ?? 'development') === 'production',
    maxAge: (process.env.NODE_ENV ?? 'development') === 'production' ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use('/assets', express.static(assetsDir, {
    dotfiles: 'deny',
    index: false,
    immutable: (process.env.NODE_ENV ?? 'development') === 'production',
    maxAge: (process.env.NODE_ENV ?? 'development') === 'production' ? '7d' : 0,
    setHeaders: res => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));
  app.use((_req, res, next) => {
    res.locals.defaultSiteLogoUrl = getSiteLogoUrl(null);
    res.locals.defaultSiteFaviconUrl = getSiteFaviconUrl(null);
    res.locals.defaultBrandHeadHtml = getBrandHeadHtml(null);
    res.locals.brandHeadHtml = getBrandHeadHtml(null);
    next();
  });

  app.use(createInstallerRouter({
    onConfigSaved: async () => {
      resetConfiguredApp();
      await ensureConfiguredApp();
    },
  }));

  app.use(async (req, res, next) => {
    loadEnvFile();
    const configPresence = getConfigPresence();

    if (!configPresence.isConfigured) {
      if (req.path === '/health') {
        return res.status(503).json({
          status: 'installing',
          databaseUrl: configPresence.hasDatabaseUrl ? 'set' : 'missing',
          sessionSecret: configPresence.hasSessionSecret ? 'set' : 'missing',
        });
      }

      return res.redirect('/install/database');
    }

    try {
      const appInstance = await ensureConfiguredApp();
      return appInstance(req, res, next);
    } catch (err) {
      if (req.path === '/health') {
        return res.status(503).json({ status: 'error', boot: 'failed' });
      }

      return renderBootError(res, err);
    }
  });

  return app;
}

async function main() {
  loadEnvFile();
  const port = Number(process.env.PORT ?? '4100');
  const bootstrapApp = createBootstrapApp();
  const configPresence = getConfigPresence();

  if (configPresence.isConfigured) {
    try {
      await ensureConfiguredApp();
    } catch (err) {
      console.error('Configured app failed to initialize at startup:', err);
    }
  }

  bootstrapApp.listen(Number.isFinite(port) ? port : 4100, () => {
    console.log(`LoomPress bootstrap server running on http://localhost:${Number.isFinite(port) ? port : 4100}`);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
