import { describe, expect, it } from 'vitest';
import { getVisiblePluginAdminNavItems } from './runtime.js';
import type { LoadedPlugin, PluginRequestContext } from './types.js';

function createRequestContext(): PluginRequestContext {
  return {
    req: {} as PluginRequestContext['req'],
    res: {} as PluginRequestContext['res'],
    currentUser: null,
    currentSite: null,
    currentSiteRole: null,
  };
}

describe('plugin admin navigation', () => {
  it('filters hidden items and applies default active keys', async () => {
    const plugins: LoadedPlugin[] = [
      {
        descriptor: {
          name: 'Alpha Plugin',
          slug: 'alpha-plugin',
          entryPath: '/plugins/alpha/index.js',
          rootDir: '/plugins/alpha',
        },
        definition: {
          name: 'Alpha Plugin',
          admin: {
            navItems: [
              { label: 'Visible', href: '/admin/alpha', order: 2 },
              {
                label: 'Hidden',
                href: '/admin/alpha/hidden',
                visible: () => false,
              },
            ],
          },
        },
      },
    ];

    const items = await getVisiblePluginAdminNavItems(plugins, createRequestContext());

    expect(items).toEqual([
      {
        label: 'Visible',
        href: '/admin/alpha',
        order: 2,
        activeNav: 'alpha-plugin',
        pluginName: 'Alpha Plugin',
        pluginSlug: 'alpha-plugin',
      },
    ]);
  });
});
