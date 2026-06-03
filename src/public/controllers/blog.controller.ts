import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import type { CategoryService } from '../../services/CategoryService.js';
import type { TagService } from '../../services/TagService.js';
import { param } from '@tagna/udiot/server';
import { sanitizeRichText, stripHtml } from '../../utils/html.js';

function normalizePublicPost<T extends { body: unknown; excerpt?: unknown; meta_description?: unknown }>(post: T) {
  const excerpt = stripHtml(post.excerpt, 320);
  const metaDescription = stripHtml(post.meta_description, 320);

  return {
    ...post,
    body: sanitizeRichText(post.body),
    excerpt: excerpt || null,
    meta_description: metaDescription || null,
  };
}

export function blogController(
  postService: PostService,
  categoryService: CategoryService,
  tagService: TagService,
) {
  const index: RequestHandler = async (req, res) => {
    const site = req.site!;
    const page = Number(param(req, 'n')) || 1;
    const { posts, total } = await postService.getPublishedPosts(site.id, page);
    const safePosts = posts.map(post => normalizePublicPost(post));
    const totalPages = Math.ceil(total / 20);

    res.render('index', {
      site,
      posts: safePosts,
      page,
      totalPages,
      title: page === 1 ? site.name : `Page ${page} — ${site.name}`,
      description: site.tagline ?? '',
    });
  };

  const singlePost: RequestHandler = async (req, res, next) => {
    const site = req.site!;
    const post = await postService.getBySlug(site.id, param(req, 'slug'));
    if (!post) return next();

    const [categories, tags, adjacent] = await Promise.all([
      postService.getPostCategories(post.id),
      postService.getPostTags(post.id),
      post.published_at ? postService.getAdjacentPosts(site.id, post.published_at) : { prev: null, next: null },
    ]);
    const safePost = normalizePublicPost(post);

    res.render('post', {
      site,
      post: safePost,
      categories,
      tags,
      prevPost: adjacent.prev,
      nextPost: adjacent.next,
      title: safePost.meta_title || safePost.title,
      description: safePost.meta_description || safePost.excerpt || '',
    });
  };

  const categoryArchive: RequestHandler = async (req, res, next) => {
    const site = req.site!;
    const category = await categoryService.getBySlug(site.id, param(req, 'slug'));
    if (!category) return next();

    const page = Number(param(req, 'n')) || 1;
    const { posts, total } = await postService.getPostsByCategory(site.id, category.id, page);
    const safePosts = posts.map(post => normalizePublicPost(post));
    const totalPages = Math.ceil(total / 20);

    res.render('category', {
      site,
      category,
      posts: safePosts,
      page,
      totalPages,
      title: `${category.name} — ${site.name}`,
      description: category.description ?? '',
    });
  };

  const tagArchive: RequestHandler = async (req, res, next) => {
    const site = req.site!;
    const tag = await tagService.getBySlug(site.id, param(req, 'slug'));
    if (!tag) return next();

    const page = Number(param(req, 'n')) || 1;
    const { posts, total } = await postService.getPostsByTag(site.id, tag.id, page);
    const safePosts = posts.map(post => normalizePublicPost(post));
    const totalPages = Math.ceil(total / 20);

    res.render('tag', {
      site,
      tag,
      posts: safePosts,
      page,
      totalPages,
      title: `#${tag.name} — ${site.name}`,
    });
  };

  return { index, singlePost, categoryArchive, tagArchive };
}
