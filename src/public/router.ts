import { Router } from 'express';
import { blogController } from './controllers/blog.controller.js';
import { feedController } from './controllers/feed.controller.js';
import { sitemapController } from './controllers/sitemap.controller.js';
import { searchController } from './controllers/search.controller.js';
import { commentController } from './controllers/comment.controller.js';
import type { PostService } from '../services/PostService.js';
import type { CategoryService } from '../services/CategoryService.js';
import type { TagService } from '../services/TagService.js';
import type { SearchService } from '../services/SearchService.js';
import type { CommentService } from '../services/CommentService.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { MenuService } from '../services/MenuService.js';

export interface BlogRouterDeps {
  postService: PostService;
  categoryService: CategoryService;
  tagService: TagService;
  searchService: SearchService;
  commentService: CommentService;
  settingsService: SettingsService;
  menuService: MenuService;
}

export function createBlogRouter(deps: BlogRouterDeps): Router {
  const router = Router();

  const blogCtrl = blogController(deps.postService, deps.categoryService, deps.tagService);
  const feedCtrl = feedController(deps.postService);
  const sitemapCtrl = sitemapController(deps.postService, deps.categoryService);
  const searchCtrl = searchController(deps.searchService);
  const commentCtrl = commentController(deps.commentService, deps.settingsService, deps.postService);

  // Static feeds/sitemaps first
  router.get('/feed.xml', feedCtrl.rss);
  router.get('/sitemap.xml', sitemapCtrl.sitemap);
  router.get('/robots.txt', sitemapCtrl.robots);

  // Search
  router.get('/search', searchCtrl.search);

  // Comment submission
  router.post('/comment', commentCtrl.submit);

  // Blog pages
  router.get('/', blogCtrl.index);
  router.get('/page/:n', blogCtrl.index);

  // Archives
  router.get('/category/:slug', blogCtrl.categoryArchive);
  router.get('/category/:slug/page/:n', blogCtrl.categoryArchive);
  router.get('/tag/:slug', blogCtrl.tagArchive);
  router.get('/tag/:slug/page/:n', blogCtrl.tagArchive);

  // Single post (catch-all, must be last)
  router.get('/:slug', blogCtrl.singlePost);

  return router;
}
