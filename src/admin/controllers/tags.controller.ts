import type { RequestHandler } from 'express';
import type { TagService } from '../../services/TagService.js';
import { param } from '@tagna/udiot/server';
import { requireNonEmptyText, sanitizeSingleLine, slugify } from '../../utils/validation.js';

export function tagsController(tagService: TagService) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const tags = await tagService.getAll(siteId);
    res.render('tags/list', { title: 'Tags', tags });
  };

  const newForm: RequestHandler = (_req, res) => {
    res.render('tags/edit', { title: 'New Tag', tag: null });
  };

  const create: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    try {
      const name = requireNonEmptyText(req.body.name, 'Name', 120);
      await tagService.create(siteId, { name, slug: slugify(sanitizeSingleLine(req.body.slug, 160) || name) });
      req.flash('success', 'Tag created.');
      res.redirect('/admin/tags');
    } catch (err: any) {
      if (err?.constraint === 'lp_tags_site_id_slug_key') {
        req.flash('error', 'A tag with that slug already exists.');
        return res.redirect('/admin/tags/new');
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to create tag.');
      res.redirect('/admin/tags/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const tag = await tagService.getById(siteId, param(req, 'id'));
    if (!tag) {
      req.flash('error', 'Tag not found.');
      return res.redirect('/admin/tags');
    }
    res.render('tags/edit', { title: `Edit: ${tag.name}`, tag });
  };

  const update: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    try {
      const name = requireNonEmptyText(req.body.name, 'Name', 120);
      await tagService.update(siteId, param(req, 'id'), { name, slug: slugify(sanitizeSingleLine(req.body.slug, 160) || name) });
      req.flash('success', 'Tag updated.');
      res.redirect('/admin/tags');
    } catch (err: any) {
      if (err?.constraint === 'lp_tags_site_id_slug_key') {
        req.flash('error', 'A tag with that slug already exists.');
        return res.redirect(`/admin/tags/${param(req, 'id')}/edit`);
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to update tag.');
      res.redirect(`/admin/tags/${param(req, 'id')}/edit`);
    }
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await tagService.delete(siteId, param(req, 'id'));
    req.flash('success', 'Tag deleted.');
    res.redirect('/admin/tags');
  };

  return { list, newForm, create, editForm, update, remove };
}
