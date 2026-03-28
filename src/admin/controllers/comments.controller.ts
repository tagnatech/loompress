import type { RequestHandler } from 'express';
import type { CommentService } from '../../services/CommentService.js';
import { param } from '@tagna/udiot/server';

export function commentsController(commentService: CommentService) {
  const list: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const page = Number(req.query.page) || 1;
    const status = req.query.status as string | undefined;
    const { comments, total } = await commentService.getBySite(siteId, status, page);
    const totalPages = Math.ceil(total / 20);
    const counts = await commentService.getCountBySite(siteId);

    res.render('comments/list', {
      title: 'Comments',
      comments,
      counts,
      page,
      totalPages,
      status: status ?? 'all',
    });
  };

  const approve: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await commentService.approve(siteId, param(req, 'id'));
    req.flash('success', 'Comment approved.');
    res.redirect('/admin/comments');
  };

  const reject: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await commentService.reject(siteId, param(req, 'id'));
    req.flash('success', 'Comment rejected.');
    res.redirect('/admin/comments');
  };

  const markSpam: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await commentService.spam(siteId, param(req, 'id'));
    req.flash('success', 'Comment marked as spam.');
    res.redirect('/admin/comments');
  };

  const remove: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    await commentService.delete(siteId, param(req, 'id'));
    req.flash('success', 'Comment deleted.');
    res.redirect('/admin/comments');
  };

  return { list, approve, reject, markSpam, remove };
}
