import type { RequestHandler } from 'express';
import type { MenuService, MenuItem } from '../../services/MenuService.js';
import { normalizeMenuLocation, normalizeOptionalPublicUrl, normalizeOptionalText } from '../../utils/validation.js';

export function menusController(menuService: MenuService) {
  const edit: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const location = normalizeMenuLocation(req.query.location);
    const items = await menuService.get(siteId, location);
    const menus = await menuService.getAll(siteId);

    res.render('menus/edit', {
      title: 'Menus',
      items,
      location,
      menus,
      locations: ['primary', 'footer', 'social'],
    });
  };

  const save: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const location = normalizeMenuLocation(req.body.location);
    const labels = Array.isArray(req.body.labels) ? req.body.labels : req.body.labels ? [req.body.labels] : [];
    const urls = Array.isArray(req.body.urls) ? req.body.urls : req.body.urls ? [req.body.urls] : [];

    const items: MenuItem[] = [];
    try {
      for (let i = 0; i < labels.length; i++) {
        const label = normalizeOptionalText(labels[i], 120);
        const url = normalizeOptionalPublicUrl(urls[i]);
        if (label && url) {
          items.push({ label, url });
        }
      }
    } catch (err) {
      req.flash('error', err instanceof Error ? err.message : 'Menu items must use valid URLs.');
      return res.redirect(`/admin/menus?location=${location}`);
    }

    await menuService.save(siteId, location, items);
    req.flash('success', 'Menu saved.');
    res.redirect(`/admin/menus?location=${location}`);
  };

  return { edit, save };
}
