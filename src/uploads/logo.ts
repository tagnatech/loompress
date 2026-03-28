import fs from 'node:fs/promises';
import type { Request } from 'express';
import { isSafeUploadedImage } from './signature.js';

export interface UploadedLogo {
  file: Express.Multer.File;
  publicUrl: string;
}

export async function resolveUploadedLogo(req: Request): Promise<UploadedLogo | null> {
  const file = req.file;
  if (!file) {
    return null;
  }

  const isSafeFile = await isSafeUploadedImage(file.path, file.mimetype);
  if (!isSafeFile) {
    await deleteUploadedFile(file);
    throw new Error('The uploaded file is not a valid supported image.');
  }

  const subDir = typeof (req as any)._uploadSubDir === 'string'
    ? (req as any)._uploadSubDir
    : '';
  if (!subDir) {
    await deleteUploadedFile(file);
    throw new Error('The uploaded file destination could not be resolved.');
  }

  return {
    file,
    publicUrl: `/uploads/${subDir}/${file.filename}`,
  };
}

export async function deleteUploadedFile(file: Express.Multer.File | null | undefined): Promise<void> {
  if (!file?.path) {
    return;
  }

  await fs.unlink(file.path).catch(() => undefined);
}
