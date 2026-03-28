import fs from 'node:fs/promises';
import type { Request, RequestHandler } from 'express';

type RedirectTarget = string | ((req: Request) => string);

const CSRF_BODY_FIELD = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function protectMultipartCsrf(redirectTo?: RedirectTarget): RequestHandler {
  return async (req, res, next) => {
    const sessionToken = req.session?._csrfToken;
    const submittedToken = readSubmittedToken(
      (req.body as Record<string, unknown> | undefined)?.[CSRF_BODY_FIELD]
      ?? req.headers[CSRF_HEADER_NAME],
    );

    if (sessionToken && submittedToken && sessionToken === submittedToken) {
      return next();
    }

    await deleteUploadedFiles(req);

    if (redirectTo) {
      req.flash('error', 'Your session expired. Refresh the page and try again.');
      return res.redirect(resolveRedirectTarget(req, redirectTo));
    }

    res.status(403).send('Invalid CSRF token');
  };
}

async function deleteUploadedFiles(req: Request): Promise<void> {
  const files = collectUploadedFiles(req);
  await Promise.all(files.map(async file => {
    if (!file.path) {
      return;
    }

    await fs.unlink(file.path).catch(() => undefined);
  }));
}

function collectUploadedFiles(req: Request): Express.Multer.File[] {
  const uploads: Express.Multer.File[] = [];

  if (req.file) {
    uploads.push(req.file);
  }

  if (Array.isArray(req.files)) {
    uploads.push(...req.files);
    return uploads;
  }

  if (!req.files || typeof req.files !== 'object') {
    return uploads;
  }

  for (const fileList of Object.values(req.files)) {
    if (Array.isArray(fileList)) {
      uploads.push(...fileList);
    }
  }

  return uploads;
}

function resolveRedirectTarget(req: Request, redirectTo: RedirectTarget): string {
  return typeof redirectTo === 'function' ? redirectTo(req) : redirectTo;
}

function readSubmittedToken(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}
