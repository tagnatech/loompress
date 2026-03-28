import type { RequestHandler } from 'express';
import type { PostService } from '../../services/PostService.js';
import type { UserService } from '../../services/UserService.js';

export function dashboardController(postService: PostService, userService: UserService) {
  const index: RequestHandler = async (req, res) => {
    const siteId = req.session.siteId!;
    const stats = await postService.getDashboardStats(siteId);
    const { posts: recentPosts } = await postService.getAllPosts(siteId, 1, undefined, 5);
    const user = await userService.getById(req.session.userId!);

    res.render('dashboard', {
      title: 'Dashboard',
      stats,
      recentPosts,
      user,
    });
  };

  return { index };
}
