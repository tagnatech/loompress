import type { RequestHandler } from 'express';
import type { MediaService } from '../../services/MediaService.js';
import fs from 'node:fs/promises';
import { param } from '@tagna/udiot/server';
import { prefixBasePath } from '../../base-path.js';
import { isSafeUploadedImage } from '../../uploads/signature.js';
import { normalizeOptionalText } from '../../utils/validation.js';

function isSiteAdmin(role: string | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export function mediaController(mediaService: MediaService) {
  const library: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const media = await mediaService.getAll(siteId);
    res.render('media/library', { title: 'Media Library', media });
  };

  const upload: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const userId = req.session.userId!;
    const file = req.file;

    if (!file) {
      req.flash('error', 'No file uploaded.');
      return res.redirect('/admin/media');
    }

    if (!req.site?.slug) {
      req.flash('error', 'Select a site before uploading media.');
      return res.redirect('/admin/media');
    }

    const isSafeFile = await isSafeUploadedImage(file.path, file.mimetype);
    if (!isSafeFile) {
      await fs.unlink(file.path).catch(() => undefined);
      req.flash('error', 'The uploaded file is not a valid supported image.');
      return res.redirect('/admin/media');
    }

    const subDir = (req as any)._uploadSubDir ?? '';
    const publicUrl = prefixBasePath(`/uploads/${subDir}/${file.filename}`);

    await mediaService.create(siteId, userId, {
      filename: file.originalname,
      storagePath: file.path,
      publicUrl,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    req.flash('success', 'File uploaded successfully.');
    res.redirect('/admin/media');
  };

  const updateAlt: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const currentSiteRole = res.locals.currentSiteRole as string | undefined;
    const existing = await mediaService.getById(siteId, param(req, 'id'));
    if (!existing) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!isSiteAdmin(currentSiteRole) && existing.uploaded_by !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const media = await mediaService.updateAltText(siteId, param(req, 'id'), normalizeOptionalText(req.body.altText, 255) ?? '');
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json({ success: true, media });
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const currentSiteRole = res.locals.currentSiteRole as string | undefined;
    const media = await mediaService.getById(siteId, param(req, 'id'));

    if (!media) {
      req.flash('error', 'File not found.');
      return res.redirect('/admin/media');
    }

    if (!isSiteAdmin(currentSiteRole) && media.uploaded_by !== req.session.userId) {
      req.flash('error', 'You can only delete your own uploads.');
      return res.redirect('/admin/media');
    }

    await mediaService.delete(siteId, param(req, 'id'));
    req.flash('success', 'File deleted.');
    res.redirect('/admin/media');
  };

  return { library, upload, updateAlt, remove };
}
