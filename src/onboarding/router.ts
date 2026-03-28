import { Router, type Request, type RequestHandler, type Response } from 'express';
import type multer from 'multer';
import type pg from 'pg';
import { hashPassword } from '../auth/password.js';
import type { SiteRecord } from '../multi-site/types.js';
import { getAvailableThemes } from '../public/theme-resolver.js';
import type { SiteService } from '../services/SiteService.js';
import type { UserService } from '../services/UserService.js';
import { protectMultipartCsrf } from '../middleware/multipart-csrf.js';
import { deleteUploadedFile, resolveUploadedLogo } from '../uploads/logo.js';
import { getTimeZoneOptions, normalizeTimeZone } from '../utils/timezone.js';
import {
  assertBaseUrlMatchesHostname,
  normalizeBaseUrl,
  normalizeEmail,
  normalizeFromOptions,
  normalizeHostname,
  normalizeOptionalText,
  normalizeOptionalPublicUrl,
  PERMALINK_PATTERNS,
  requireNonEmptyText,
  sanitizeSingleLine,
  slugify,
} from '../utils/validation.js';

const MIN_PASSWORD_LENGTH = 10;

interface OnboardingRouterDeps {
  pool: pg.Pool;
  siteService: SiteService;
  userService: UserService;
  upload: multer.Multer;
}

interface OnboardingValues {
  site_name?: string;
  site_hostname?: string;
  site_slug?: string;
  site_tagline?: string;
  site_logo_url?: string;
  site_base_url?: string;
  site_timezone?: string;
  site_permalink_pattern?: string;
  site_theme?: string;
  admin_name?: string;
  admin_email?: string;
}

interface OnboardingState {
  requiresOnboarding: boolean;
  requiresSiteCreation: boolean;
  existingSite: SiteRecord | null;
  existingSiteCount: number;
}

interface CreatedSite {
  id: string;
  hostname: string;
  name: string;
}

interface CreatedUser {
  id: string;
}

function detectBaseUrl(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto ? forwardedProto.split(',')[0] : req.protocol).trim();
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost ?? req.get('host') ?? 'localhost').split(',')[0].trim();
  return `${protocol}://${host}`;
}

function collectValues(body: Record<string, unknown>): OnboardingValues {
  return {
    site_name: typeof body.site_name === 'string' ? body.site_name : '',
    site_hostname: typeof body.site_hostname === 'string' ? body.site_hostname : '',
    site_slug: typeof body.site_slug === 'string' ? body.site_slug : '',
    site_tagline: typeof body.site_tagline === 'string' ? body.site_tagline : '',
    site_logo_url: typeof body.site_logo_url === 'string' ? body.site_logo_url : '',
    site_base_url: typeof body.site_base_url === 'string' ? body.site_base_url : '',
    site_timezone: typeof body.site_timezone === 'string' ? body.site_timezone : '',
    site_permalink_pattern: typeof body.site_permalink_pattern === 'string' ? body.site_permalink_pattern : '',
    site_theme: typeof body.site_theme === 'string' ? body.site_theme : '',
    admin_name: typeof body.admin_name === 'string' ? body.admin_name : '',
    admin_email: typeof body.admin_email === 'string' ? body.admin_email : '',
  };
}

async function getOnboardingState(siteService: SiteService, userService: UserService): Promise<OnboardingState> {
  const [sites, hasUsers] = await Promise.all([
    siteService.getAll(),
    userService.hasAnyUsers(),
  ]);

  return {
    requiresOnboarding: !hasUsers,
    requiresSiteCreation: sites.length === 0,
    existingSite: sites[0] ?? null,
    existingSiteCount: sites.length,
  };
}

function getThemeOptions() {
  return getAvailableThemes().map(name => ({
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
  }));
}

function getDefaultValues(req: Request, state: OnboardingState): OnboardingValues {
  return {
    site_hostname: state.existingSite?.hostname ?? req.hostname,
    site_name: state.existingSite?.name ?? '',
    site_slug: state.existingSite?.slug ?? '',
    site_tagline: state.existingSite?.tagline ?? '',
    site_logo_url: state.existingSite?.logo_url ?? '',
    site_base_url: state.existingSite?.base_url ?? detectBaseUrl(req),
    site_timezone: state.existingSite?.timezone ?? 'UTC',
    site_permalink_pattern: state.existingSite?.permalink_pattern ?? 'slug',
    site_theme: state.existingSite?.theme ?? 'default',
  };
}

function renderOnboarding(
  req: Request,
  res: Response,
  state: OnboardingState,
  values: OnboardingValues = {},
  error?: string,
): void {
  const defaultValues = getDefaultValues(req, state);

  res.status(error ? 400 : 200).render('onboarding', {
    title: 'Set Up LoomPress',
    suggestedHostname: req.hostname,
    suggestedBaseUrl: detectBaseUrl(req),
    onboardingError: error,
    values: { ...defaultValues, ...values },
    onboardingState: state,
    themes: getThemeOptions(),
    timezones: getTimeZoneOptions(values.site_timezone ?? defaultValues.site_timezone ?? 'UTC'),
    permalinkOptions: [
      { value: 'slug', label: '/:slug' },
      { value: 'dated', label: '/:year/:month/:day/:slug' },
      { value: 'category-slug', label: '/:category/:slug' },
    ],
  });
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function createOnboardingRouter(deps: OnboardingRouterDeps): Router {
  const router = Router();

  const index: RequestHandler = async (req, res, next) => {
    try {
      const onboardingState = await getOnboardingState(deps.siteService, deps.userService);
      if (!onboardingState.requiresOnboarding) {
        return next();
      }

      renderOnboarding(req, res, onboardingState);
    } catch (error) {
      next(error);
    }
  };

  const create: RequestHandler = async (req, res, next) => {
    const values = collectValues(req.body as Record<string, unknown>);
    let uploadedLogo: Awaited<ReturnType<typeof resolveUploadedLogo>> | null = null;

    try {
      const onboardingState = await getOnboardingState(deps.siteService, deps.userService);
      if (!onboardingState.requiresOnboarding) {
        req.flash('info', 'LoomPress is already configured.');
        return res.redirect('/admin/login');
      }

      const adminName = requireNonEmptyText(values.admin_name, 'Admin name', 120);
      const adminEmail = normalizeEmail(values.admin_email);
      const adminPassword = typeof req.body.admin_password === 'string' ? req.body.admin_password : '';
      const adminPasswordConfirm = typeof req.body.admin_password_confirm === 'string' ? req.body.admin_password_confirm : '';

      if (!adminPassword) {
        return renderOnboarding(req, res, onboardingState, values, 'Complete every required field before continuing.');
      }

      if (adminPassword.length < MIN_PASSWORD_LENGTH) {
        return renderOnboarding(req, res, onboardingState, values, `Choose an admin password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      }

      if (adminPassword !== adminPasswordConfirm) {
        return renderOnboarding(req, res, onboardingState, values, 'Admin password and confirmation must match.');
      }

      uploadedLogo = await resolveUploadedLogo(req);

      const availableThemes = getAvailableThemes();
      const theme = sanitizeSingleLine(values.site_theme, 64) || 'default';
      if (!availableThemes.includes(theme)) {
        return renderOnboarding(req, res, onboardingState, values, 'Choose a valid theme.');
      }

      let site: CreatedSite | null = onboardingState.existingSite
        ? {
          id: onboardingState.existingSite.id,
          hostname: onboardingState.existingSite.hostname,
          name: onboardingState.existingSite.name,
        }
        : null;

      const passwordHash = await hashPassword(adminPassword);
      const client = await deps.pool.connect();

      try {
        await client.query('BEGIN');

        if (onboardingState.requiresSiteCreation) {
          const siteName = requireNonEmptyText(values.site_name, 'Site name', 120);
          const rawSlug = sanitizeSingleLine(values.site_slug, 120);
          const siteSlug = rawSlug || slugify(siteName);
          const siteTagline = normalizeOptionalText(values.site_tagline, 255);
          const hostname = normalizeHostname(values.site_hostname);
          const baseUrl = normalizeBaseUrl(values.site_base_url);
          const logoUrl = uploadedLogo?.publicUrl ?? normalizeOptionalPublicUrl(values.site_logo_url) ?? null;
          const timezone = normalizeTimeZone(values.site_timezone);
          const permalinkPattern = normalizeFromOptions(values.site_permalink_pattern, PERMALINK_PATTERNS, 'slug');

          if (!siteSlug) {
            return renderOnboarding(req, res, onboardingState, values, 'Enter a valid site slug.');
          }

          assertBaseUrlMatchesHostname(hostname, baseUrl);

          const siteResult = await client.query<CreatedSite>(
            `INSERT INTO lp_sites (hostname, name, slug, tagline, logo_url, base_url, timezone, permalink_pattern, theme)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, hostname, name`,
            [hostname, siteName, siteSlug, siteTagline ?? null, logoUrl, baseUrl, timezone, permalinkPattern, theme],
          );

          site = siteResult.rows[0];
        }

        if (!site) {
          throw new Error('A site is required before setup can continue.');
        }

        const userResult = await client.query<CreatedUser>(
          `INSERT INTO lp_users (email, password_hash, display_name, role)
           VALUES ($1, $2, $3, 'superadmin')
           RETURNING id`,
          [adminEmail, passwordHash, adminName],
        );

        const user = userResult.rows[0];

        await client.query(
          `INSERT INTO lp_site_users (site_id, user_id, role)
           VALUES ($1, $2, 'admin')
           ON CONFLICT (site_id, user_id) DO UPDATE SET role = 'admin'`,
          [site.id, user.id],
        );

        await client.query('COMMIT');

        await regenerateSession(req);
        req.session.userId = user.id;
        req.session.siteId = site.id;
        req.flash('success', onboardingState.requiresSiteCreation
          ? `LoomPress is ready for ${site.name}.`
          : 'LoomPress setup is complete. Your superadmin account is ready.');
        res.redirect('/admin/posts');
      } catch (error: any) {
        await client.query('ROLLBACK');
        await deleteUploadedFile(uploadedLogo?.file);

        if (error?.constraint === 'lp_sites_hostname_key') {
          return renderOnboarding(req, res, onboardingState, values, 'That hostname is already in use.');
        }

        if (error?.constraint === 'lp_sites_slug_key') {
          return renderOnboarding(req, res, onboardingState, values, 'That site slug is already in use.');
        }

        if (error?.constraint === 'lp_users_email_key') {
          return renderOnboarding(req, res, onboardingState, values, 'That admin email address is already in use.');
        }

        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      if (error instanceof Error) {
        await deleteUploadedFile(uploadedLogo?.file);
        const onboardingState = await getOnboardingState(deps.siteService, deps.userService);
        return renderOnboarding(req, res, onboardingState, values, error.message);
      }

      next(error);
    }
  };

  router.get('/', index);
  router.get('/onboarding', index);
  router.post('/onboarding', deps.upload.single('logo_file'), protectMultipartCsrf('/onboarding'), create);

  return router;
}
