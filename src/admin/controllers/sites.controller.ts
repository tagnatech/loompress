import type { RequestHandler } from 'express';
import type { SiteService } from '../../services/SiteService.js';
import type { UserService } from '../../services/UserService.js';
import { param } from '@tagna/udiot/server';
import { getAvailableThemes } from '../../public/theme-resolver.js';
import { deleteUploadedFile, resolveUploadedLogo } from '../../uploads/logo.js';
import { getTimeZoneOptions, normalizeTimeZone } from '../../utils/timezone.js';
import {
  normalizeBaseUrl,
  normalizeFromOptions,
  normalizeHostname,
  normalizeOptionalText,
  normalizeOptionalPublicUrl,
  PERMALINK_PATTERNS,
  requireNonEmptyText,
  sanitizeCustomCss,
  sanitizeSingleLine,
  slugify,
} from '../../utils/validation.js';

export function sitesController(siteService: SiteService, userService: UserService) {
  const getThemeOptions = () => getAvailableThemes().map(name => ({
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
  }));

  const list: RequestHandler = async (_req, res) => {
    const sites = await siteService.getAll();
    res.render('sites/list', { title: 'Sites', sites });
  };

  const newForm: RequestHandler = (_req, res) => {
    res.render('sites/edit', {
      title: 'New Site',
      site: null,
      themes: getThemeOptions(),
      timezones: getTimeZoneOptions('UTC'),
    });
  };

  const create: RequestHandler = async (req, res) => {
    const availableThemes = getAvailableThemes();
    const theme = sanitizeSingleLine(req.body.theme, 64);
    let uploadedLogo: Awaited<ReturnType<typeof resolveUploadedLogo>> | null = null;

    try {
      if (theme && !availableThemes.includes(theme)) {
        throw new Error('Invalid theme.');
      }

      uploadedLogo = await resolveUploadedLogo(req);

      await siteService.create({
        hostname: normalizeHostname(req.body.hostname),
        name: requireNonEmptyText(req.body.name, 'Site name'),
        slug: slugify(requireNonEmptyText(req.body.slug, 'Slug')),
        tagline: normalizeOptionalText(req.body.tagline, 255),
        logo_url: uploadedLogo?.publicUrl ?? normalizeOptionalPublicUrl(req.body.logo_url) ?? null,
        base_url: normalizeBaseUrl(req.body.base_url),
        timezone: normalizeTimeZone(req.body.timezone),
        permalink_pattern: normalizeFromOptions(req.body.permalink_pattern, PERMALINK_PATTERNS, 'slug'),
        theme: theme || 'default',
      });
      req.flash('success', 'Site created.');
      res.redirect('/admin/sites');
    } catch (err: any) {
      await deleteUploadedFile(uploadedLogo?.file);
      if (err?.constraint === 'lp_sites_hostname_key') {
        req.flash('error', 'A site with that hostname already exists.');
        return res.redirect('/admin/sites/new');
      }
      if (err?.constraint === 'lp_sites_slug_key') {
        req.flash('error', 'A site with that slug already exists.');
        return res.redirect('/admin/sites/new');
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to create site.');
      res.redirect('/admin/sites/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const site = await siteService.getById(param(req, 'id'));
    if (!site) {
      req.flash('error', 'Site not found.');
      return res.redirect('/admin/sites');
    }
    res.render('sites/edit', {
      title: `Edit: ${site.name}`,
      site,
      themes: getThemeOptions(),
      timezones: getTimeZoneOptions(site.timezone),
    });
  };

  const update: RequestHandler = async (req, res) => {
    const availableThemes = getAvailableThemes();
    const theme = sanitizeSingleLine(req.body.theme, 64);
    let uploadedLogo: Awaited<ReturnType<typeof resolveUploadedLogo>> | null = null;

    try {
      if (theme && !availableThemes.includes(theme)) {
        throw new Error('Invalid theme.');
      }

      uploadedLogo = await resolveUploadedLogo(req);

      await siteService.update(param(req, 'id'), {
        hostname: normalizeHostname(req.body.hostname),
        name: requireNonEmptyText(req.body.name, 'Site name'),
        tagline: normalizeOptionalText(req.body.tagline, 255) ?? null,
        logo_url: uploadedLogo?.publicUrl ?? normalizeOptionalPublicUrl(req.body.logo_url) ?? null,
        base_url: normalizeBaseUrl(req.body.base_url),
        timezone: normalizeTimeZone(req.body.timezone),
        permalink_pattern: normalizeFromOptions(req.body.permalink_pattern, PERMALINK_PATTERNS, 'slug'),
        theme: theme || 'default',
        custom_css: sanitizeCustomCss(req.body.custom_css) ?? null,
      });
      req.flash('success', 'Site updated.');
      res.redirect(`/admin/sites/${param(req, 'id')}/edit`);
    } catch (err: any) {
      await deleteUploadedFile(uploadedLogo?.file);
      if (err?.constraint === 'lp_sites_hostname_key') {
        req.flash('error', 'A site with that hostname already exists.');
        return res.redirect(`/admin/sites/${param(req, 'id')}/edit`);
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to update site.');
      res.redirect(`/admin/sites/${param(req, 'id')}/edit`);
    }
  };

  const switchSite: RequestHandler = async (req, res) => {
    const siteId = sanitizeSingleLine(req.body.siteId, 64);
    if (!siteId) {
      req.flash('error', 'No site selected.');
      return res.redirect('/admin/sites');
    }

    const userId = req.session.userId!;
    const hasAccess = await userService.hasSiteAccess(userId, siteId);
    if (!hasAccess) {
      req.flash('error', 'You do not have access to that site.');
      return res.redirect('/admin/sites');
    }

    req.session.siteId = siteId;
    res.redirect('/admin/posts');
  };

  return { list, newForm, create, editForm, update, switchSite };
}
