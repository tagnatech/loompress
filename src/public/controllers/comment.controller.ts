import type { RequestHandler } from 'express';
import type { CommentService } from '../../services/CommentService.js';
import type { SettingsService } from '../../services/SettingsService.js';
import type { PostService } from '../../services/PostService.js';
import { redirectBackOr } from '../../utils/redirect.js';
import {
  isUuid,
  normalizeEmail,
  normalizeOptionalHttpUrl,
  sanitizeMultilineText,
} from '../../utils/validation.js';

export function commentController(
  commentService: CommentService,
  settingsService: SettingsService,
  postService: PostService,
) {
  const submit: RequestHandler = async (req, res) => {
    const site = req.site!;
    const postId = isUuid(req.body.post_id) ? String(req.body.post_id) : '';

    if (!postId) {
      return res.status(400).send('Invalid post.');
    }

    // Check if comments are enabled
    const enabled = await settingsService.get(site.id, 'comments.enabled');
    if (enabled !== 'true') {
      return res.status(403).send('Comments are disabled.');
    }

    const post = await postService.getById(site.id, postId);
    if (!post || post.status !== 'published') {
      return res.status(404).send('Post not found.');
    }

    const authorName = sanitizeMultilineText(req.body.author_name, 120);
    const body = sanitizeMultilineText(req.body.body, 5000);

    // Validation
    if (!authorName || !body) {
      req.flash('error', 'Name and comment are required.');
      return redirectBackOr(req, res, `/${post.slug}`);
    }

    const requireEmail = await settingsService.get(site.id, 'comments.require_email');
    if (requireEmail === 'true' && !sanitizeMultilineText(req.body.author_email, 320)) {
      req.flash('error', 'Email is required.');
      return redirectBackOr(req, res, `/${post.slug}`);
    }

    let authorEmail = '';
    const rawAuthorEmail = sanitizeMultilineText(req.body.author_email, 320);
    if (rawAuthorEmail) {
      try {
        authorEmail = normalizeEmail(rawAuthorEmail);
      } catch {
        req.flash('error', 'Enter a valid email address.');
        return redirectBackOr(req, res, `/${post.slug}`);
      }
    }

    let authorUrl: string | undefined;
    try {
      authorUrl = normalizeOptionalHttpUrl(req.body.author_url);
    } catch {
      req.flash('error', 'Enter a valid website URL.');
      return redirectBackOr(req, res, `/${post.slug}`);
    }

    const parentId = isUuid(req.body.parent_id) ? String(req.body.parent_id) : undefined;
    if (parentId) {
      const parent = await commentService.getById(site.id, parentId);
      if (!parent || parent.post_id !== postId) {
        return res.status(400).send('Invalid parent comment.');
      }
    }

    const moderation = await settingsService.get(site.id, 'comments.moderation');
    await commentService.create(site.id, postId, {
      author_name: authorName,
      author_email: authorEmail,
      author_url: authorUrl,
      body,
      parent_id: parentId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: moderation === 'true' ? 'pending' : 'approved',
    });

    if (moderation === 'true') {
      req.flash('success', 'Your comment has been submitted and is awaiting moderation.');
    } else {
      req.flash('success', 'Comment posted.');
    }

    redirectBackOr(req, res, `/${post.slug}`);
  };

  return { submit };
}
