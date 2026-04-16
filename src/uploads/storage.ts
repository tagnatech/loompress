import path from 'node:path';
import { getBasePath, prefixBasePath } from '../base-path.js';

export function resolveStoragePath(uploadDir: string, siteSlug: string, subDir: string, filename: string): string {
  return path.join(uploadDir, siteSlug, subDir, filename);
}

export function resolvePublicUrl(
  siteSlug: string,
  subDir: string,
  filename: string,
  basePath = getBasePath(),
): string {
  return prefixBasePath(`/uploads/${siteSlug}/${subDir}/${filename}`, basePath);
}
