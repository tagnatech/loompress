import type { RequestHandler } from 'express';
import type pg from 'pg';

async function getGlobalRole(pool: pg.Pool, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    'SELECT role FROM lp_users WHERE id = $1',
    [userId],
  );
  return rows[0]?.role ?? null;
}

async function getSiteRole(pool: pg.Pool, userId: string, siteId: string): Promise<string | null> {
  const { rows } = await pool.query<{ role: string }>(
    'SELECT role FROM lp_site_users WHERE site_id = $1 AND user_id = $2',
    [siteId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function canAccessSite(pool: pg.Pool, userId: string, siteId: string): Promise<boolean> {
  const globalRole = await getGlobalRole(pool, userId);
  if (globalRole === 'superadmin') {
    return true;
  }

  const siteRole = await getSiteRole(pool, userId, siteId);
  return Boolean(siteRole);
}

export function requireAuth(): RequestHandler {
  return (req, res, next) => {
    if (!req.session?.userId) {
      return res.redirect('/admin/login');
    }
    next();
  };
}

export function requireSiteAccess(pool: pg.Pool): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    const siteId = req.session?.siteId;

    if (!userId || !siteId) {
      return res.redirect('/admin/login');
    }

    try {
      const hasAccess = await canAccessSite(pool, userId, siteId);
      if (!hasAccess) {
        res.status(403).send('Access denied: you do not have access to this site');
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles: string[]): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.redirect('/admin/login');
    }

    try {
      const userRole = await getGlobalRole((req as any).app.locals.pool, userId);
      if (!userRole || (!roles.includes(userRole) && userRole !== 'superadmin')) {
        res.status(403).send('Access denied');
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireSiteRole(pool: pg.Pool, ...roles: string[]): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session?.userId;
    const siteId = req.session?.siteId;

    if (!userId || !siteId) {
      return res.redirect('/admin/login');
    }

    try {
      const globalRole = await getGlobalRole(pool, userId);
      if (globalRole === 'superadmin') {
        return next();
      }

      const siteRole = await getSiteRole(pool, userId, siteId);
      if (!siteRole || !roles.includes(siteRole)) {
        res.status(403).send('Access denied');
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

