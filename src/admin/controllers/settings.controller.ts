import type { RequestHandler } from 'express';
import type { SettingsService } from '../../services/SettingsService.js';
import type { SiteService } from '../../services/SiteService.js';
import { getAvailableThemes } from '../../public/theme-resolver.js';
import {
  normalizeDateFormat,
  normalizeOptionalText,
  parseIntegerInRange,
} from '../../utils/validation.js';

export function settingsController(settingsService: SettingsService, siteService: SiteService) {
  const general: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const settings = await settingsService.getAll(siteId);
    const site = await siteService.getById(siteId);

    res.render('settings/general', {
      title: 'Settings',
      settings,
      site,
    });
  };

  const saveGeneral: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    await settingsService.setMany(siteId, {
      'site.posts_per_page': String(parseIntegerInRange(req.body.posts_per_page, 20, 1, 100)),
      'site.date_format': normalizeDateFormat(req.body.date_format),
      'site.show_author': req.body.show_author === 'on' ? 'true' : 'false',
      'reading.excerpt_length': String(parseIntegerInRange(req.body.excerpt_length, 160, 50, 500)),
      'reading.show_full_content': req.body.show_full_content === 'on' ? 'true' : 'false',
    });

    req.flash('success', 'General settings saved.');
    res.redirect('/admin/settings');
  };

  const comments: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const settings = await settingsService.getAll(siteId);

    res.render('settings/comments', {
      title: 'Comment Settings',
      settings,
    });
  };

  const saveComments: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    await settingsService.setMany(siteId, {
      'comments.enabled': req.body.enabled === 'on' ? 'true' : 'false',
      'comments.moderation': req.body.moderation === 'on' ? 'true' : 'false',
      'comments.require_email': req.body.require_email === 'on' ? 'true' : 'false',
      'comments.allow_nested': req.body.allow_nested === 'on' ? 'true' : 'false',
      'comments.max_depth': String(parseIntegerInRange(req.body.max_depth, 3, 1, 10)),
    });

    req.flash('success', 'Comment settings saved.');
    res.redirect('/admin/settings/comments');
  };

  const seo: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const settings = await settingsService.getAll(siteId);

    res.render('settings/seo', {
      title: 'SEO Settings',
      settings,
    });
  };

  const saveSeo: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    await settingsService.setMany(siteId, {
      'seo.meta_title_suffix': normalizeOptionalText(req.body.meta_title_suffix, 120) ?? '',
      'seo.default_meta_description': normalizeOptionalText(req.body.default_meta_description, 320) ?? '',
      'seo.noindex_archives': req.body.noindex_archives === 'on' ? 'true' : 'false',
    });

    req.flash('success', 'SEO settings saved.');
    res.redirect('/admin/settings/seo');
  };

  const themes: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const site = await siteService.getById(siteId);
    const availableThemes = getAvailableThemes();

    const themeDetails = availableThemes.map(name => ({
      name,
      active: site?.theme === name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      description: getThemeDescription(name),
    }));

    res.render('settings/themes', {
      title: 'Themes',
      themes: themeDetails,
      currentTheme: site?.theme ?? 'default',
    });
  };

  const activateTheme: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const theme = normalizeOptionalText(req.body.theme, 64) ?? 'default';
    const available = getAvailableThemes();

    if (!available.includes(theme)) {
      req.flash('error', 'Invalid theme.');
      return res.redirect('/admin/settings/themes');
    }

    await siteService.update(siteId, { theme });
    req.flash('success', `Theme "${theme}" activated.`);
    res.redirect('/admin/settings/themes');
  };

  return { general, saveGeneral, comments, saveComments, seo, saveSeo, themes, activateTheme };
}

function getThemeDescription(name: string): string {
  const descriptions: Record<string, string> = {
    default: 'A clean, minimal blog theme with a focus on readability. Serif body text with a single-column layout.',
    minimal: 'Ultra-minimal design with maximum whitespace. Perfect for text-heavy blogs that prioritize content.',
    magazine: 'A bold, image-forward theme with card-based layout. Great for visual storytelling and media-rich content.',
    developer: 'Dark-mode theme optimized for technical writing. Monospace headings and syntax-highlighting-friendly design.',
  };
  return descriptions[name] ?? 'A custom blog theme.';
}
