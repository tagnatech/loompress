import { createUploadMiddleware } from '@tagna/udiot/server';
import type { Config } from '../config/index.js';
import { sanitizeSingleLine, slugify } from '../utils/validation.js';

function resolveUploadSiteSlug(req: Express.Request): string {
  const body = (req as Express.Request & { body?: Record<string, unknown> }).body;

  if (req.site?.slug) {
    return req.site.slug;
  }

  const explicitSlug = sanitizeSingleLine(
    body?.site_upload_slug
    ?? body?.site_slug
    ?? body?.slug,
    120,
  );
  if (explicitSlug) {
    return slugify(explicitSlug) || 'default';
  }

  const name = sanitizeSingleLine(
    body?.site_name
    ?? body?.name,
    120,
  );
  if (name) {
    return slugify(name) || 'default';
  }

  return 'default';
}

export function setupUpload(config: Config) {
  return createUploadMiddleware({
    destDir: config.uploadDir,
    maxFileSizeMb: config.uploadMaxSizeMb,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    subDirFn: resolveUploadSiteSlug,
  });
}
