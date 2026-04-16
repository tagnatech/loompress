import path from 'node:path';
import { normalizeBasePath } from '../base-path.js';

export interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  sessionSecret: string;
  assetsDir: string;
  uploadDir: string;
  uploadMaxSizeMb: number;
  adminBaseUrl: string;
  trustProxy: boolean | number;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  commentRateLimitMax: number;
  commentRateLimitWindowMs: number;
  pluginsDir: string;
  pluginEntries: string[];
  basePath: string;
  isDev: boolean;
  isProd: boolean;
}

export interface ConfigPresence {
  hasDatabaseUrl: boolean;
  hasSessionSecret: boolean;
  isConfigured: boolean;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseTrustProxy(value: string | undefined, isProd: boolean): boolean | number {
  if (!value) {
    return isProd ? 1 : false;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  const count = Number(normalized);
  if (Number.isInteger(count) && count >= 0) {
    return count;
  }

  return isProd ? 1 : false;
}

export function loadConfig(): Config {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const sessionSecret = required('SESSION_SECRET');

  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.');
  }

  return {
    port: parseInteger(process.env.PORT, 4100),
    nodeEnv,
    databaseUrl: required('DATABASE_URL'),
    sessionSecret,
    assetsDir: path.resolve(process.env.ASSETS_DIR ?? './assets'),
    uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads-data'),
    uploadMaxSizeMb: parseInteger(process.env.UPLOAD_MAX_SIZE_MB, 20),
    adminBaseUrl: process.env.ADMIN_BASE_URL ?? `http://localhost:${parseInteger(process.env.PORT, 4100)}`,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY, nodeEnv === 'production'),
    loginRateLimitMax: parseInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
    loginRateLimitWindowMs: parseInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    commentRateLimitMax: parseInteger(process.env.COMMENT_RATE_LIMIT_MAX, 10),
    commentRateLimitWindowMs: parseInteger(process.env.COMMENT_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    pluginsDir: path.resolve(process.env.PLUGINS_DIR ?? './plugins'),
    pluginEntries: parseList(process.env.PLUGINS).map(entry => path.resolve(entry)),
    basePath: normalizeBasePath(process.env.BASE_PATH ?? process.env.ADMIN_BASE_URL),
    isDev: nodeEnv === 'development',
    isProd: nodeEnv === 'production',
  };
}

export function getConfigPresence(env: NodeJS.ProcessEnv = process.env): ConfigPresence {
  const hasDatabaseUrl = Boolean(env.DATABASE_URL);
  const hasSessionSecret = Boolean(env.SESSION_SECRET);

  return {
    hasDatabaseUrl,
    hasSessionSecret,
    isConfigured: hasDatabaseUrl && hasSessionSecret,
  };
}
