import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPlugins } from './loader.js';

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('plugin loader', () => {
  it('loads an explicit plugin directory and resolves relative asset paths', async () => {
    const tempDir = await createTempDir('loompress-plugin-');
    const pluginDir = path.join(tempDir, 'example-plugin');
    const adminViewsDir = path.join(pluginDir, 'admin', 'views');
    const staticDir = path.join(pluginDir, 'static');

    await fs.mkdir(adminViewsDir, { recursive: true });
    await fs.mkdir(staticDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, 'index.mjs'),
      [
        'export default {',
        "  name: 'Example Plugin',",
        "  admin: { viewsDir: './admin/views', navItems: [{ label: 'Example', href: '/admin/example' }] },",
        "  staticDir: './static'",
        '};',
      ].join('\n'),
      'utf8',
    );

    const plugins = await loadPlugins({
      pluginsDir: path.join(tempDir, 'plugins'),
      pluginEntries: [pluginDir],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0].descriptor.name).toBe('Example Plugin');
    expect(plugins[0].descriptor.slug).toBe('example-plugin');
    expect(plugins[0].descriptor.adminViewsDir).toBe(adminViewsDir);
    expect(plugins[0].descriptor.staticDir).toBe(staticDir);
    expect(plugins[0].descriptor.staticMountPath).toBe('/plugins-static/example-plugin');
  });

  it('discovers plugins from the configured directory when no explicit list is provided', async () => {
    const tempDir = await createTempDir('loompress-plugin-discovery-');
    const pluginsDir = path.join(tempDir, 'plugins');
    const alphaDir = path.join(pluginsDir, 'alpha');

    await fs.mkdir(alphaDir, { recursive: true });
    await fs.writeFile(
      path.join(alphaDir, 'loompress.plugin.mjs'),
      "export default { name: 'Alpha Plugin' };",
      'utf8',
    );

    const plugins = await loadPlugins({
      pluginsDir,
      pluginEntries: [],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0].descriptor.name).toBe('Alpha Plugin');
    expect(plugins[0].descriptor.slug).toBe('alpha-plugin');
  });
});
