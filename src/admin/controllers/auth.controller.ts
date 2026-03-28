import type { RequestHandler } from 'express';
import type { UserService } from '../../services/UserService.js';
import { normalizeEmail } from '../../utils/validation.js';

function regenerateSession(req: Parameters<RequestHandler>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req: Parameters<RequestHandler>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function authController(userService: UserService) {
  const loginPage: RequestHandler = (req, res) => {
    if (req.session?.userId) {
      return res.redirect(req.session.siteId ? '/admin/posts' : '/admin/sites');
    }
    res.render('login', { title: 'Login' });
  };

  const login: RequestHandler = async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/admin/login');
    }

    let normalizedEmail: string;

    try {
      normalizedEmail = normalizeEmail(email);
    } catch {
      req.flash('error', 'Enter a valid email address.');
      return res.redirect('/admin/login');
    }

    const user = await userService.authenticate(normalizedEmail, password);
    if (!user) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/admin/login');
    }

    await regenerateSession(req);
    req.session.userId = user.id;

    // If superadmin, redirect to site picker. Otherwise auto-select their site.
    if (user.role === 'superadmin') {
      delete req.session.siteId;
      return res.redirect('/admin/sites');
    }

    const sites = await userService.getUserSites(user.id);
    if (sites.length === 1) {
      req.session.siteId = sites[0].site_id;
      return res.redirect('/admin/posts');
    }

    return res.redirect('/admin/sites');
  };

  const logout: RequestHandler = async (req, res, next) => {
    try {
      await destroySession(req);
      res.clearCookie('loompress.sid', { path: '/' });
      res.redirect('/admin/login');
    } catch (err) {
      next(err);
    }
  };

  return { loginPage, login, logout };
}
