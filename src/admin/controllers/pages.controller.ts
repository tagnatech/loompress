import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import { param } from '@tagna/udiot/server';
import { sanitizeRichText, stripHtml } from '../../utils/html.js';
import {
  normalizeOptionalText,
  normalizePageStatus,
  requireNonEmptyText,
  sanitizeSingleLine,
  slugify,
} from '../../utils/validation.js';

function isSiteAdmin(role: string | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

async function loadEditablePage(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  postService: PostService,
) {
  const siteId = req.session.siteId!;
  const pageRecord = await postService.getById(siteId, param(req, 'id'));

  if (!pageRecord) {
    req.flash('error', 'Page not found.');
    res.redirect('/admin/pages');
    return null;
  }

  const currentSiteRole = res.locals.currentSiteRole as string | undefined;
  if (!isSiteAdmin(currentSiteRole) && pageRecord.author_id !== req.session.userId) {
    req.flash('error', 'You can only manage your own pages.');
    res.redirect('/admin/pages');
    return null;
  }

  return pageRecord;
}

export function pagesController(postService: PostService) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const page = Number(req.query.page) || 1;
    const currentSiteRole = res.locals.currentSiteRole as string | undefined;
    const authorId = isSiteAdmin(currentSiteRole) ? undefined : req.session.userId;
    const { posts: pages, total } = await postService.getAllPages(siteId, page, 20, authorId);
    const totalPages = Math.ceil(total / 20);

    res.render('pages/list', {
      title: 'Pages',
      pages,
      page,
      totalPages,
    });
  };

  const newForm: RequestHandler = async (_req, res) => {
    res.render('pages/edit', {
      title: 'New Page',
      page: null,
    });
  };

  const create: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const userId = req.session.userId!;

    try {
      const title = requireNonEmptyText(req.body.title, 'Title', 200);
      const finalSlug = slugify(sanitizeSingleLine(req.body.slug, 200) || title);
      const created = await postService.create(siteId, userId, {
        type: 'page',
        slug: finalSlug,
        title,
        body: sanitizeRichText(req.body.body),
        status: normalizePageStatus(req.body.status),
        meta_title: normalizeOptionalText(req.body.meta_title, 255),
        meta_description: normalizeOptionalText(stripHtml(req.body.meta_description, 320), 320),
      });
      req.flash('success', 'Page created.');
      res.redirect(`/admin/pages/${created.id}/edit`);
    } catch (err: any) {
      if (err.constraint === 'lp_posts_site_id_slug_key') {
        req.flash('error', 'A page with that slug already exists.');
        return res.redirect('/admin/pages/new');
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to create page.');
      return res.redirect('/admin/pages/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const pageRecord = await loadEditablePage(req, res, postService);
    if (!pageRecord) {
      return;
    }

    res.render('pages/edit', {
      title: `Edit: ${pageRecord.title}`,
      page: pageRecord,
    });
  };

  const update: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const pageRecord = await loadEditablePage(req, res, postService);
    if (!pageRecord) {
      return;
    }

    try {
      const title = requireNonEmptyText(req.body.title, 'Title', 200);
      await postService.update(siteId, param(req, 'id'), {
        type: 'page',
        title,
        slug: slugify(sanitizeSingleLine(req.body.slug, 200) || title),
        body: sanitizeRichText(req.body.body),
        status: normalizePageStatus(req.body.status),
        meta_title: normalizeOptionalText(req.body.meta_title, 255) ?? null,
        meta_description: normalizeOptionalText(stripHtml(req.body.meta_description, 320), 320) ?? null,
      });
      req.flash('success', 'Page updated.');
      res.redirect(`/admin/pages/${param(req, 'id')}/edit`);
    } catch (err: any) {
      if (err.constraint === 'lp_posts_site_id_slug_key') {
        req.flash('error', 'A page with that slug already exists.');
        return res.redirect(`/admin/pages/${param(req, 'id')}/edit`);
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to update page.');
      return res.redirect(`/admin/pages/${param(req, 'id')}/edit`);
    }
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const pageRecord = await loadEditablePage(req, res, postService);
    if (!pageRecord) {
      return;
    }
    await postService.delete(siteId, param(req, 'id'));
    req.flash('success', 'Page deleted.');
    res.redirect('/admin/pages');
  };

  return { list, newForm, create, editForm, update, remove };
}

