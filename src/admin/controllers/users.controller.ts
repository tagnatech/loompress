import type { RequestHandler } from 'express';
import type { UserService } from '../../services/UserService.js';
import { param } from '@tagna/udiot/server';
import { normalizeEmail, normalizeSiteRole, requireNonEmptyText } from '../../utils/validation.js';

const MIN_PASSWORD_LENGTH = 10;

export function usersController(userService: UserService) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const users = await userService.getSiteUsers(siteId);
    res.render('users/list', { title: 'Users', users });
  };

  const newForm: RequestHandler = (_req, res) => {
    res.render('users/edit', { title: 'New User', user: null });
  };

  const create: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!req.body.email || !password || !req.body.display_name) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/admin/users/new');
    }

    try {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      }

      const email = normalizeEmail(req.body.email);
      const displayName = requireNonEmptyText(req.body.display_name, 'Display name', 120);
      const role = normalizeSiteRole(req.body.role);

      const existingUser = await userService.findByEmail(email);
      if (existingUser) {
        req.flash('error', 'A user with that email already exists. Ask a superadmin to link existing accounts.');
        return res.redirect('/admin/users/new');
      }

      const user = await userService.create({ email, password, display_name: displayName });
      await userService.addToSite(user.id, siteId, role);
      req.flash('success', 'User created and added to site.');
      res.redirect('/admin/users');
    } catch (err: any) {
      req.flash('error', err instanceof Error ? err.message : 'Unable to create user.');
      return res.redirect('/admin/users/new');
    }
  };

  const editForm: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const user = await userService.getSiteUser(siteId, param(req, 'id'));
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }
    res.render('users/edit', { title: `Edit: ${user.display_name}`, user });
  };

  const update: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const targetUserId = param(req, 'id');

    if (targetUserId === req.session.userId) {
      req.flash('error', 'You cannot change your own site role here.');
      return res.redirect('/admin/users');
    }

    const existing = await userService.getSiteUser(siteId, targetUserId);
    if (!existing) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    await userService.updateRole(targetUserId, siteId, normalizeSiteRole(req.body.role));
    req.flash('success', 'User role updated.');
    res.redirect('/admin/users');
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const targetUserId = param(req, 'id');

    if (targetUserId === req.session.userId) {
      req.flash('error', 'You cannot remove your own access from the current site.');
      return res.redirect('/admin/users');
    }

    const existing = await userService.getSiteUser(siteId, targetUserId);
    if (!existing) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    await userService.removeFromSite(targetUserId, siteId);
    req.flash('success', 'User removed from site.');
    res.redirect('/admin/users');
  };

  return { list, newForm, create, editForm, update, remove };
}

