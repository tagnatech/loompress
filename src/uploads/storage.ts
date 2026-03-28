import path from 'node:path';

export function resolveStoragePath(uploadDir: string, siteSlug: string, subDir: string, filename: string): string {
  return path.join(uploadDir, siteSlug, subDir, filename);
}

export function resolvePublicUrl(siteSlug: string, subDir: string, filename: string): string {
  return `/uploads/${siteSlug}/${subDir}/${filename}`;
}
