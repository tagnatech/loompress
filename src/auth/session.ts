import { createSessionMiddleware } from '@tagna/udiot/server';
import type pg from 'pg';
import type { RequestHandler } from 'express';

export function setupSession(pool: pg.Pool, secret: string, isProd: boolean): RequestHandler {
  return createSessionMiddleware({
    secret,
    pgPool: pool,
    tableName: 'lp_sessions',
    cookieName: 'loompress.sid',
    secure: isProd,
    sameSite: 'lax',
    cookie: {
      path: '/',
    },
  });
}
