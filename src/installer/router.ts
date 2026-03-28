import crypto from 'node:crypto';
import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { getConfigPresence } from '../config/index.js';
import { loadEnvFile, writeEnvFile } from '../config/env-file.js';
import { getDatabaseClient } from '../db/client.js';
import { runMigrations } from '../db/run-migrations.js';

interface InstallerRouterDeps {
  onConfigSaved?: () => Promise<void>;
}

interface InstallerValues {
  database_url?: string;
}

function detectAdminBaseUrl(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto ? forwardedProto.split(',')[0] : req.protocol).trim();
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost ?? req.get('host') ?? 'localhost').split(',')[0].trim();
  return `${protocol}://${host}`;
}

function collectValues(body: Record<string, unknown>): InstallerValues {
  return {
    database_url: typeof body.database_url === 'string' ? body.database_url : '',
  };
}

function renderDatabaseSetup(
  req: Request,
  res: Response,
  values: InstallerValues = {},
  error?: string,
): void {
  res.status(error ? 400 : 200).render('install/database', {
    title: 'Install LoomPress',
    installerError: error,
    values,
    suggestedAdminBaseUrl: detectAdminBaseUrl(req),
  });
}

async function verifyDatabaseConnection(databaseUrl: string): Promise<void> {
  const db = await getDatabaseClient(databaseUrl);

  try {
    await db.query('SELECT 1');
  } finally {
    await db.end();
  }
}

export function createInstallerRouter(deps: InstallerRouterDeps = {}): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: true, limit: '20kb' }));
  router.use((req, _res, next) => {
    loadEnvFile();
    next();
  });
  router.use((req, res, next) => {
    if (getConfigPresence().isConfigured && req.path.startsWith('/install/')) {
      res.redirect('/');
      return;
    }
    next();
  });

  const showForm: RequestHandler = (req, res) => {
    renderDatabaseSetup(req, res, {
      database_url: process.env.DATABASE_URL ?? '',
    });
  };

  const saveDatabase: RequestHandler = async (req, res, next) => {
    const values = collectValues(req.body as Record<string, unknown>);

    try {
      const databaseUrl = values.database_url?.trim();
      if (!databaseUrl) {
        return renderDatabaseSetup(req, res, values, 'Database URL is required.');
      }

      await verifyDatabaseConnection(databaseUrl);
      await runMigrations(databaseUrl);

      const sessionSecret = process.env.SESSION_SECRET?.trim()
        || crypto.randomBytes(32).toString('base64url');
      const updates: Record<string, string> = {
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
      };

      if (!process.env.ADMIN_BASE_URL) {
        updates.ADMIN_BASE_URL = detectAdminBaseUrl(req);
      }

      writeEnvFile(updates);
      loadEnvFile({ overrideExisting: true });

      if (deps.onConfigSaved) {
        await deps.onConfigSaved();
      }

      res.redirect('/');
    } catch (error) {
      if (error instanceof Error) {
        return renderDatabaseSetup(req, res, values, error.message);
      }

      next(error);
    }
  };

  router.get('/install/database', showForm);
  router.post('/install/database', saveDatabase);

  return router;
}
