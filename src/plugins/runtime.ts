import type { LoadedPlugin, PluginRequestContext, VisiblePluginAdminNavItem } from './types.js';

export async function getVisiblePluginAdminNavItems(
  plugins: LoadedPlugin[],
  ctx: PluginRequestContext,
): Promise<VisiblePluginAdminNavItem[]> {
  const items: VisiblePluginAdminNavItem[] = [];

  for (const plugin of plugins) {
    const navItems = plugin.definition.admin?.navItems ?? [];

    for (const navItem of navItems) {
      const isVisible = navItem.visible ? await navItem.visible(ctx) : true;
      if (!isVisible) {
        continue;
      }

      items.push({
        ...navItem,
        activeNav: navItem.activeNav ?? plugin.descriptor.slug,
        pluginName: plugin.descriptor.name,
        pluginSlug: plugin.descriptor.slug,
      });
    }
  }

  return items.sort((left, right) => {
    const leftOrder = left.order ?? 0;
    const rightOrder = right.order ?? 0;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.label.localeCompare(right.label);
  });
}
