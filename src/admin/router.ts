import { Router } from 'express';
import type pg from 'pg';
import type multer from 'multer';
import { authController } from './controllers/auth.controller.js';
import { dashboardController } from './controllers/dashboard.controller.js';
import { postsController } from './controllers/posts.controller.js';
import { pagesController } from './controllers/pages.controller.js';
import { mediaController } from './controllers/media.controller.js';
import { categoriesController } from './controllers/categories.controller.js';
import { tagsController } from './controllers/tags.controller.js';
import { commentsController } from './controllers/comments.controller.js';
import { sitesController } from './controllers/sites.controller.js';
import { usersController } from './controllers/users.controller.js';
import { pluginsController } from './controllers/plugins.controller.js';
import { settingsController } from './controllers/settings.controller.js';
import { menusController } from './controllers/menus.controller.js';
import { requireAuth } from '../auth/middleware.js';
import { requireSiteAccess } from '../auth/middleware.js';
import { requireRole, requireSiteRole } from '../auth/middleware.js';
import { protectMultipartCsrf } from '../middleware/multipart-csrf.js';
import type { PostService } from '../services/PostService.js';
import type { CategoryService } from '../services/CategoryService.js';
import type { TagService } from '../services/TagService.js';
import type { MediaService } from '../services/MediaService.js';
import type { SiteService } from '../services/SiteService.js';
import type { UserService } from '../services/UserService.js';
import type { CommentService } from '../services/CommentService.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { MenuService } from '../services/MenuService.js';

export interface AdminRouterDeps {
  pool: pg.Pool;
  postService: PostService;
  categoryService: CategoryService;
  tagService: TagService;
  mediaService: MediaService;
  siteService: SiteService;
  userService: UserService;
  commentService: CommentService;
  settingsService: SettingsService;
  menuService: MenuService;
  upload: multer.Multer;
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();
  const auth = requireAuth();
  const siteAccess = requireSiteAccess(deps.pool);
  const siteAdmin = requireSiteRole(deps.pool, 'admin');
  const superadmin = requireRole('superadmin');

  const authCtrl = authController(deps.userService);
  const dashCtrl = dashboardController(deps.postService, deps.userService);
  const postsCtrl = postsController(deps.postService, deps.categoryService, deps.tagService);
  const pageCtrl = pagesController(deps.postService);
  const mediaCtrl = mediaController(deps.mediaService);
  const catCtrl = categoriesController(deps.categoryService);
  const tagCtrl = tagsController(deps.tagService);
  const commentCtrl = commentsController(deps.commentService);
  const siteCtrl = sitesController(deps.siteService, deps.userService);
  const userCtrl = usersController(deps.userService);
  const pluginCtrl = pluginsController();
  const settingsCtrl = settingsController(deps.settingsService, deps.siteService);
  const menuCtrl = menusController(deps.menuService);

  // Auth (no guards)
  router.get('/login', authCtrl.loginPage);
  router.post('/login', authCtrl.login);
  router.post('/logout', authCtrl.logout);

  // Dashboard
  router.get('/', auth, siteAccess, dashCtrl.index);
  router.get('/dashboard', auth, siteAccess, dashCtrl.index);

  // Posts
  router.get('/posts', auth, siteAccess, postsCtrl.list);
  router.get('/posts/new', auth, siteAccess, postsCtrl.newForm);
  router.post('/posts/new', auth, siteAccess, postsCtrl.create);
  router.get('/posts/:id/edit', auth, siteAccess, postsCtrl.editForm);
  router.post('/posts/:id/edit', auth, siteAccess, postsCtrl.update);
  router.post('/posts/:id/publish', auth, siteAccess, postsCtrl.publish);
  router.post('/posts/:id/unpublish', auth, siteAccess, postsCtrl.unpublish);
  router.post('/posts/:id/delete', auth, siteAccess, postsCtrl.remove);

  // Pages
  router.get('/pages', auth, siteAccess, pageCtrl.list);
  router.get('/pages/new', auth, siteAccess, pageCtrl.newForm);
  router.post('/pages/new', auth, siteAccess, pageCtrl.create);
  router.get('/pages/:id/edit', auth, siteAccess, pageCtrl.editForm);
  router.post('/pages/:id/edit', auth, siteAccess, pageCtrl.update);
  router.post('/pages/:id/delete', auth, siteAccess, pageCtrl.remove);

  // Media
  router.get('/media', auth, siteAccess, mediaCtrl.library);
  router.post('/media/upload', auth, siteAccess, deps.upload.single('file'), protectMultipartCsrf('/admin/media'), mediaCtrl.upload);
  router.patch('/media/:id', auth, siteAccess, mediaCtrl.updateAlt);
  router.post('/media/:id/delete', auth, siteAccess, mediaCtrl.remove);

  // Categories
  router.get('/categories', auth, siteAccess, catCtrl.list);
  router.get('/categories/new', auth, siteAccess, siteAdmin, catCtrl.newForm);
  router.post('/categories/new', auth, siteAccess, siteAdmin, catCtrl.create);
  router.get('/categories/:id/edit', auth, siteAccess, siteAdmin, catCtrl.editForm);
  router.post('/categories/:id/edit', auth, siteAccess, siteAdmin, catCtrl.update);
  router.post('/categories/:id/delete', auth, siteAccess, siteAdmin, catCtrl.remove);

  // Tags
  router.get('/tags', auth, siteAccess, tagCtrl.list);
  router.get('/tags/new', auth, siteAccess, siteAdmin, tagCtrl.newForm);
  router.post('/tags/new', auth, siteAccess, siteAdmin, tagCtrl.create);
  router.get('/tags/:id/edit', auth, siteAccess, siteAdmin, tagCtrl.editForm);
  router.post('/tags/:id/edit', auth, siteAccess, siteAdmin, tagCtrl.update);
  router.post('/tags/:id/delete', auth, siteAccess, siteAdmin, tagCtrl.remove);

  // Comments
  router.get('/comments', auth, siteAccess, siteAdmin, commentCtrl.list);
  router.post('/comments/:id/approve', auth, siteAccess, siteAdmin, commentCtrl.approve);
  router.post('/comments/:id/reject', auth, siteAccess, siteAdmin, commentCtrl.reject);
  router.post('/comments/:id/spam', auth, siteAccess, siteAdmin, commentCtrl.markSpam);
  router.post('/comments/:id/delete', auth, siteAccess, siteAdmin, commentCtrl.remove);

  // Menus
  router.get('/menus', auth, siteAccess, siteAdmin, menuCtrl.edit);
  router.post('/menus', auth, siteAccess, siteAdmin, menuCtrl.save);

  // Settings
  router.get('/settings', auth, siteAccess, siteAdmin, settingsCtrl.general);
  router.post('/settings', auth, siteAccess, siteAdmin, settingsCtrl.saveGeneral);
  router.get('/settings/comments', auth, siteAccess, siteAdmin, settingsCtrl.comments);
  router.post('/settings/comments', auth, siteAccess, siteAdmin, settingsCtrl.saveComments);
  router.get('/settings/seo', auth, siteAccess, siteAdmin, settingsCtrl.seo);
  router.post('/settings/seo', auth, siteAccess, siteAdmin, settingsCtrl.saveSeo);
  router.get('/settings/themes', auth, siteAccess, siteAdmin, settingsCtrl.themes);
  router.post('/settings/themes/activate', auth, siteAccess, siteAdmin, settingsCtrl.activateTheme);

  // Sites (superadmin)
  router.get('/sites', auth, superadmin, siteCtrl.list);
  router.get('/sites/new', auth, superadmin, siteCtrl.newForm);
  router.post('/sites/new', auth, superadmin, deps.upload.single('logo_file'), protectMultipartCsrf('/admin/sites/new'), siteCtrl.create);
  router.get('/sites/:id/edit', auth, superadmin, siteCtrl.editForm);
  router.post('/sites/:id/edit', auth, superadmin, deps.upload.single('logo_file'), protectMultipartCsrf(req => `/admin/sites/${req.params.id}/edit`), siteCtrl.update);
  router.get('/plugins', auth, superadmin, pluginCtrl.list);
  router.post('/switch-site', auth, siteCtrl.switchSite);

  // Users
  router.get('/users', auth, siteAccess, siteAdmin, userCtrl.list);
  router.get('/users/new', auth, siteAccess, siteAdmin, userCtrl.newForm);
  router.post('/users/new', auth, siteAccess, siteAdmin, userCtrl.create);
  router.get('/users/:id/edit', auth, siteAccess, siteAdmin, userCtrl.editForm);
  router.post('/users/:id/edit', auth, siteAccess, siteAdmin, userCtrl.update);
  router.post('/users/:id/delete', auth, siteAccess, siteAdmin, userCtrl.remove);

  return router;
}
