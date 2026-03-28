import type { RequestHandler } from 'express';

export function pluginsController() {
  const list: RequestHandler = (req, res) => {
    const plugins = Array.isArray(req.app.locals.plugins) ? req.app.locals.plugins : [];

    res.render('plugins/list', {
      title: 'Plugins',
      activeNav: 'plugins',
      plugins,
    });
  };

  return { list };
}
