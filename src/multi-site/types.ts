export interface SiteRecord {
  id: string;
  hostname: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo_url: string | null;
  base_url: string;
  timezone: string;
  permalink_pattern: string;
  theme: string;
  custom_css: string | null;
  created_at: Date;
  updated_at: Date;
}

// Augment Express types
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
