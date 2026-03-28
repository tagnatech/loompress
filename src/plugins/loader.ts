import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadedPlugin, LoomPressPlugin, ResolvedPluginDescriptor } from './types.js';

const ENTRY_FILE_CANDIDATES = [
  'loompress.plugin.js',
  'loompress.plugin.mjs',
  'loompress.plugin.cjs',
  'index.js',
  'index.mjs',
  'index.cjs',
  path.join('dist', 'index.js'),
  path.join('dist', 'index.mjs'),
  path.join('dist', 'index.cjs'),
];

export interface PluginLoaderOptions {
  pluginsDir: string;
  pluginEntries: string[];
}

export async function loadPlugins(options: PluginLoaderOptions): Promise<LoadedPlugin[]> {
  const entryPaths = resolvePluginEntryPaths(options);
  const loadedPlugins: LoadedPlugin[] = [];
  const seenSlugs = new Set<string>();

  for (const entryPath of entryPaths) {
    const definition = await importPlugin(entryPath);
    const descriptor = resolveDescriptor(entryPath, definition);

    if (seenSlugs.has(descriptor.slug)) {
      throw new Error(`Duplicate plugin slug "${descriptor.slug}" found while loading ${entryPath}`);
    }

    seenSlugs.add(descriptor.slug);
    loadedPlugins.push({ descriptor, definition });
  }

  return loadedPlugins;
}

function resolvePluginEntryPaths(options: PluginLoaderOptions): string[] {
  if (options.pluginEntries.length > 0) {
    return options.pluginEntries.map(resolvePluginEntryOrThrow);
  }

  return discoverPluginEntries(options.pluginsDir);
}

function discoverPluginEntries(pluginsDir: string): string[] {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const dirents = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const entries: string[] = [];

  for (const dirent of dirents) {
    const pluginTarget = path.join(pluginsDir, dirent.name);

    if (!dirent.isDirectory() && !dirent.isFile()) {
      continue;
    }

    const resolvedEntry = resolvePluginEntry(pluginTarget);
    if (resolvedEntry) {
      entries.push(resolvedEntry);
    }
  }

  return entries.sort((left, right) => left.localeCompare(right));
}

function resolvePluginEntryOrThrow(pluginTarget: string): string {
  const resolvedEntry = resolvePluginEntry(pluginTarget);
  if (!resolvedEntry) {
    throw new Error(`Could not find a LoomPress plugin entry for "${pluginTarget}"`);
  }
  return resolvedEntry;
}

function resolvePluginEntry(pluginTarget: string): string | null {
  if (!fs.existsSync(pluginTarget)) {
    return null;
  }

  const stat = fs.statSync(pluginTarget);
  if (stat.isFile()) {
    return pluginTarget;
  }

  if (!stat.isDirectory()) {
    return null;
  }

  for (const candidate of ENTRY_FILE_CANDIDATES) {
    const candidatePath = path.join(pluginTarget, candidate);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return null;
}

async function importPlugin(entryPath: string): Promise<LoomPressPlugin> {
  const imported = await import(pathToFileURL(entryPath).href);
  const candidate = imported.default ?? imported.plugin ?? imported;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`Plugin "${entryPath}" must export an object`);
  }

  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    throw new Error(`Plugin "${entryPath}" must export a non-empty "name"`);
  }

  return candidate as LoomPressPlugin;
}

function resolveDescriptor(entryPath: string, definition: LoomPressPlugin): ResolvedPluginDescriptor {
  const rootDir = path.dirname(entryPath);
  const slug = slugify(definition.name);
  const adminViewsDir = resolveDirectory(rootDir, definition.admin?.viewsDir, 'admin.viewsDir');
  const staticDir = resolveDirectory(rootDir, definition.staticDir, 'staticDir');

  return {
    name: definition.name,
    slug,
    version: definition.version,
    description: definition.description,
    entryPath,
    rootDir,
    adminViewsDir,
    staticDir,
    staticMountPath: staticDir ? `/plugins-static/${slug}` : undefined,
  };
}

function resolveDirectory(rootDir: string, value: string | undefined, label: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const resolvedPath = path.resolve(rootDir, value);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Plugin ${label} path does not exist or is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}

function slugify(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new Error(`Plugin name "${input}" does not produce a valid slug`);
  }

  return normalized;
}
