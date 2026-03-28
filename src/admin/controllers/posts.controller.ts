import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import type { CategoryService } from '../../services/CategoryService.js';
import type { TagService } from '../../services/TagService.js';
import { param } from '@tagna/udiot/server';
import { sanitizeRichText, stripHtml } from '../../utils/html.js';
import {
  isUuid,
  normalizeOptionalText,
  normalizePostStatus,
  normalizeScheduledAt,
  requireNonEmptyText,
  sanitizeSingleLine,
  slugify,
} from '../../utils/validation.js';

function isSiteAdmin(role: string | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

async function loadEditablePost(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  postService: PostService,
) {
  const siteId = req.session.siteId!;
  const post = await postService.getById(siteId, param(req, 'id'));

  if (!post) {
    req.flash('error', 'Post not found.');
    res.redirect('/admin/posts');
    return null;
  }

  const currentSiteRole = res.locals.currentSiteRole as string | undefined;
  if (!isSiteAdmin(currentSiteRole) && post.author_id !== req.session.userId) {
    req.flash('error', 'You can only manage your own posts.');
    res.redirect('/admin/posts');
    return null;
  }

  return post;
}

export function postsController(
  postService: PostService,
  categoryService: CategoryService,
  tagService: TagService,
) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const page = Number(req.query.page) || 1;
    const status = typeof req.query.status === 'string' ? sanitizeSingleLine(req.query.status, 32) : undefined;
    const currentSiteRole = res.locals.currentSiteRole as string | undefined;
    const authorId = isSiteAdmin(currentSiteRole) ? undefined : req.session.userId;
    const { posts, total } = await postService.getAllPosts(siteId, page, status, 20, authorId);
    const totalPages = Math.ceil(total / 20);

    res.render('posts/list', {
      title: 'Posts',
      posts,
      page,
      totalPages,
      status: status ?? 'all',
    });
  };

  const newForm: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const categories = await categoryService.getAll(siteId);
    const tags = await tagService.getAll(siteId);

    res.render('posts/edit', {
      title: 'New Post',
      post: null,
      categories,
      tags,
      postCategories: [],
      postTags: [],
    });
  };

  const create: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const userId = req.session.userId!;

    try {
      const title = requireNonEmptyText(req.body.title, 'Title', 200);
      const status = normalizePostStatus(req.body.status);
      const scheduledAt = status === 'scheduled'
        ? normalizeScheduledAt(req.body.scheduled_at)
        : undefined;

      if (status === 'scheduled' && !scheduledAt) {
        req.flash('error', 'Scheduled posts require a valid schedule date.');
        return res.redirect('/admin/posts/new');
      }

      const category_ids = (Array.isArray(req.body.category_ids) ? req.body.category_ids : req.body.category_ids ? [req.body.category_ids] : [])
        .filter((value: unknown) => isUuid(value));
      const tag_names = req.body.tags
        ? String(req.body.tags).split(',').map((t: string) => sanitizeSingleLine(t, 64)).filter(Boolean)
        : [];
      const tag_ids: string[] = [];

      for (const name of tag_names) {
        const tag = await tagService.findOrCreate(siteId, name);
        tag_ids.push(tag.id);
      }

      const finalSlug = slugify(sanitizeSingleLine(req.body.slug, 200) || title);
      const post = await postService.create(siteId, userId, {
        slug: finalSlug,
        title,
        excerpt: normalizeOptionalText(stripHtml(req.body.excerpt, 320), 320),
        body: sanitizeRichText(req.body.body),
        status,
        featured_image_id: isUuid(req.body.featured_image_id) ? String(req.body.featured_image_id) : undefined,
        meta_title: normalizeOptionalText(req.body.meta_title, 255),
        meta_description: normalizeOptionalText(stripHtml(req.body.meta_description, 320), 320),
        scheduled_at: scheduledAt,
        category_ids,
        tag_ids,
      });
      req.flash('success', 'Post created successfully.');
      res.redirect(`/admin/posts/${post.id}/edit`);
    } catch (err: any) {
      if (err.constraint === 'lp_posts_site_id_slug_key') {
        req.flash('error', 'A post with that slug already exists.');
        return res.redirect('/admin/posts/new');
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to create post.');
      return res.redirect('/admin/posts/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const post = await loadEditablePost(req, res, postService);
    if (!post) {
      return;
    }

    const siteId = req.session.siteId!;
    const categories = await categoryService.getAll(siteId);
    const tags = await tagService.getAll(siteId);
    const postCategories = await postService.getPostCategories(post.id);
    const postTags = await postService.getPostTags(post.id);

    res.render('posts/edit', {
      title: `Edit: ${post.title}`,
      post,
      categories,
      tags,
      postCategories: postCategories.map(c => c.id),
      postTags,
    });
  };

  const update: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const existingPost = await loadEditablePost(req, res, postService);
    if (!existingPost) {
      return;
    }

    try {
      const title = requireNonEmptyText(req.body.title, 'Title', 200);
      const status = normalizePostStatus(req.body.status);
      const scheduledAt = status === 'scheduled'
        ? normalizeScheduledAt(req.body.scheduled_at)
        : undefined;

      if (status === 'scheduled' && !scheduledAt) {
        req.flash('error', 'Scheduled posts require a valid schedule date.');
        return res.redirect(`/admin/posts/${param(req, 'id')}/edit`);
      }

      const category_ids = (Array.isArray(req.body.category_ids) ? req.body.category_ids : req.body.category_ids ? [req.body.category_ids] : [])
        .filter((value: unknown) => isUuid(value));
      const tag_names = req.body.tags
        ? String(req.body.tags).split(',').map((t: string) => sanitizeSingleLine(t, 64)).filter(Boolean)
        : [];
      const tag_ids: string[] = [];

      for (const name of tag_names) {
        const tag = await tagService.findOrCreate(siteId, name);
        tag_ids.push(tag.id);
      }

      await postService.update(siteId, param(req, 'id'), {
        title,
        slug: slugify(sanitizeSingleLine(req.body.slug, 200) || title),
        excerpt: normalizeOptionalText(stripHtml(req.body.excerpt, 320), 320) ?? null,
        body: sanitizeRichText(req.body.body),
        status,
        featured_image_id: isUuid(req.body.featured_image_id) ? String(req.body.featured_image_id) : null,
        meta_title: normalizeOptionalText(req.body.meta_title, 255) ?? null,
        meta_description: normalizeOptionalText(stripHtml(req.body.meta_description, 320), 320) ?? null,
        scheduled_at: scheduledAt ?? null,
        category_ids,
        tag_ids,
      });
      req.flash('success', 'Post updated successfully.');
      res.redirect(`/admin/posts/${param(req, 'id')}/edit`);
    } catch (err: any) {
      if (err.constraint === 'lp_posts_site_id_slug_key') {
        req.flash('error', 'A post with that slug already exists.');
        return res.redirect(`/admin/posts/${param(req, 'id')}/edit`);
      }
      req.flash('error', err instanceof Error ? err.message : 'Unable to update post.');
      return res.redirect(`/admin/posts/${param(req, 'id')}/edit`);
    }
  };

  const publish: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const post = await loadEditablePost(req, res, postService);
    if (!post) {
      return;
    }
    await postService.update(siteId, param(req, 'id'), { status: 'published' });
    req.flash('success', 'Post published.');
    res.redirect('/admin/posts');
  };

  const unpublish: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const post = await loadEditablePost(req, res, postService);
    if (!post) {
      return;
    }
    await postService.update(siteId, param(req, 'id'), { status: 'draft' });
    req.flash('success', 'Post unpublished.');
    res.redirect('/admin/posts');
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const post = await loadEditablePost(req, res, postService);
    if (!post) {
      return;
    }
    await postService.delete(siteId, param(req, 'id'));
    req.flash('success', 'Post deleted.');
    res.redirect('/admin/posts');
  };

  return { list, newForm, create, editForm, update, publish, unpublish, remove };
}

