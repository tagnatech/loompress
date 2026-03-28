import 'express';
import 'express-session';
import type { SiteRecord } from './multi-site/types.js';

// req.flash() is now declared by @tagna/udiot/server flash module
declare global {
  namespace Express {
    interface Request {
      site?: SiteRecord | null;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    siteId?: string;
    flash?: Record<string, string[]>;
    _csrfToken?: string;
  }
}
