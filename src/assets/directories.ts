import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ASSET_SUBDIRECTORIES = [
  'default',
  'images',
  'js',
  'ts',
] as const;

export function ensureAssetsDirectories(assetsDir: string): void {
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const subDir of DEFAULT_ASSET_SUBDIRECTORIES) {
    fs.mkdirSync(path.join(assetsDir, subDir), { recursive: true });
  }
}
