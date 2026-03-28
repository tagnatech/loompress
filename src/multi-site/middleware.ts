import type { RequestHandler } from 'express';
import type { SiteResolver } from './resolver.js';
import { sanitizeCustomCss } from '../utils/validation.js';

export function siteMiddleware(resolver: SiteResolver): RequestHandler {
  return async (req, res, next) => {
    // Skip site resolution for admin routes — admin uses session-based site
    if (req.path.startsWith('/admin')) {
      return next();
    }

    try {
      const site = await resolver.findByHostname(req.hostname);
      req.site = site
        ? { ...site, custom_css: sanitizeCustomCss(site.custom_css) ?? null }
        : site;

      if (!site) {
        res.status(404).send('Site not found');
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
