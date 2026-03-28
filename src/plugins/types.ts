import type { Express, Request, RequestHandler, Response, Router } from 'express';
import type pg from 'pg';
import type multer from 'multer';
import type { Config } from '../config/index.js';
import type { SiteRecord } from '../multi-site/types.js';
import type { CategoryService } from '../services/CategoryService.js';
import type { CommentService } from '../services/CommentService.js';
import type { MediaService } from '../services/MediaService.js';
import type { MenuService } from '../services/MenuService.js';
import type { PostService } from '../services/PostService.js';
import type { SearchService } from '../services/SearchService.js';
import type { SettingsService } from '../services/SettingsService.js';
import type { SiteService } from '../services/SiteService.js';
import type { TagService } from '../services/TagService.js';
import type { UserRecord, UserService } from '../services/UserService.js';

export type Awaitable<T> = T | Promise<T>;

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface LoomPressServices {
  siteService: SiteService;
  userService: UserService;
  postService: PostService;
  categoryService: CategoryService;
  tagService: TagService;
  mediaService: MediaService;
  commentService: CommentService;
  settingsService: SettingsService;
  searchService: SearchService;
  menuService: MenuService;
}

export interface PluginAuthHelpers {
  requireAuth: () => RequestHandler;
  requireSiteAccess: () => RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireSiteRole: (...roles: string[]) => RequestHandler;
}

export interface PluginRequestContext {
  req: Request;
  res: Response;
  currentUser: UserRecord | null;
  currentSite: SiteRecord | null;
  currentSiteRole: string | null;
}

export interface PluginAdminNavItem {
  label: string;
  href: string;
  activeNav?: string;
  order?: number;
  visible?: (ctx: PluginRequestContext) => Awaitable<boolean>;
}

export interface PluginAdminConfig {
  viewsDir?: string;
  navItems?: PluginAdminNavItem[];
}

export interface LoomPressPlugin {
  name: string;
  version?: string;
  description?: string;
  admin?: PluginAdminConfig;
  staticDir?: string;
  setup?: (ctx: LoomPressPluginContext) => Awaitable<void>;
  registerAdminRoutes?: (ctx: LoomPressPluginRouteContext) => Awaitable<void>;
  registerPublicRoutes?: (ctx: LoomPressPluginRouteContext) => Awaitable<void>;
}

export interface ResolvedPluginDescriptor {
  name: string;
  slug: string;
  version?: string;
  description?: string;
  entryPath: string;
  rootDir: string;
  adminViewsDir?: string;
  staticDir?: string;
  staticMountPath?: string;
}

export interface LoadedPlugin {
  descriptor: ResolvedPluginDescriptor;
  definition: LoomPressPlugin;
}

export interface LoomPressPluginContext {
  app: Express;
  config: Config;
  pool: pg.Pool;
  upload: multer.Multer;
  services: LoomPressServices;
  auth: PluginAuthHelpers;
  plugin: ResolvedPluginDescriptor;
  logger: PluginLogger;
}

export interface LoomPressPluginRouteContext extends LoomPressPluginContext {
  router: Router;
}

export interface VisiblePluginAdminNavItem extends PluginAdminNavItem {
  pluginName: string;
  pluginSlug: string;
}

export function definePlugin<T extends LoomPressPlugin>(plugin: T): T {
  return plugin;
}
