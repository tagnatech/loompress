import type { RequestHandler } from 'express';
import type { CategoryService } from '../../services/CategoryService.js';
import { param } from '@tagna/udiot/server';
import { isUuid, normalizeOptionalMultilineText, requireNonEmptyText, sanitizeSingleLine, slugify } from '../../utils/validation.js';

export function categoriesController(categoryService: CategoryService) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const categories = await categoryService.getAll(siteId);
    res.render('categories/list', { title: 'Categories', categories });
  };

  const newForm: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const categories = await categoryService.getAll(siteId);
    res.render('categories/edit', { title: 'New Category', category: null, categories });
  };

  const create: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    try {
      const name = requireNonEmptyText(req.body.name, 'Name', 120);
      await categoryService.create(siteId, {
        name,
        slug: slugify(sanitizeSingleLine(req.body.slug, 160) || name),
        parent_id: isUuid(req.body.parent_id) ? String(req.body.parent_id) : undefined,
        description: normalizeOptionalMultilineText(req.body.description, 1000),
      });
      req.flash('success', 'Category created.');
      res.redirect('/admin/categories');
    } catch (err: any) {
      if (err?.constraint === 'lp_categories_site_id_slug_key') {
        req.flash('error', 'A category with that slug already exists.');
        return res.redirect('/admin/categories/new');
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to create category.');
      res.redirect('/admin/categories/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const category = await categoryService.getById(siteId, param(req, 'id'));
    if (!category) {
      req.flash('error', 'Category not found.');
      return res.redirect('/admin/categories');
    }
    const categories = await categoryService.getAll(siteId);
    res.render('categories/edit', { title: `Edit: ${category.name}`, category, categories });
  };

  const update: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;

    try {
      const name = requireNonEmptyText(req.body.name, 'Name', 120);
      await categoryService.update(siteId, param(req, 'id'), {
        name,
        slug: slugify(sanitizeSingleLine(req.body.slug, 160) || name),
        parent_id: isUuid(req.body.parent_id) ? String(req.body.parent_id) : null,
        description: normalizeOptionalMultilineText(req.body.description, 1000) ?? null,
      });
      req.flash('success', 'Category updated.');
      res.redirect('/admin/categories');
    } catch (err: any) {
      if (err?.constraint === 'lp_categories_site_id_slug_key') {
        req.flash('error', 'A category with that slug already exists.');
        return res.redirect(`/admin/categories/${param(req, 'id')}/edit`);
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to update category.');
      res.redirect(`/admin/categories/${param(req, 'id')}/edit`);
    }
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await categoryService.delete(siteId, param(req, 'id'));
    req.flash('success', 'Category deleted.');
    res.redirect('/admin/categories');
  };

  return { list, newForm, create, editForm, update, remove };
}
