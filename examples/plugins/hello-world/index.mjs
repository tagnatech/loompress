export default {
  name: 'Hello World',
  description: 'Example LoomPress plugin with admin and public routes.',
  admin: {
    viewsDir: './admin/views',
    navItems: [
      {
        label: 'Hello Plugin',
        href: '/admin/plugins/hello-world',
        activeNav: 'hello-world',
      },
    ],
  },
  staticDir: './static',
  setup(ctx) {
    ctx.logger.info('registered example plugin');
  },
  registerAdminRoutes({ router, auth, plugin }) {
    router.get('/plugins/hello-world', auth.requireAuth(), (req, res) => {
      res.render('plugins/hello-world/index', {
        title: 'Hello Plugin',
        activeNav: plugin.slug,
        plugin,
        assetBase: plugin.staticMountPath,
      });
    });
  },
  registerPublicRoutes({ router, plugin }) {
    router.get('/plugin-demo', (req, res) => {
      res.json({
        plugin: plugin.name,
        description: plugin.description ?? null,
        site: req.site?.slug ?? null,
        ok: true,
      });
    });
  },
};
