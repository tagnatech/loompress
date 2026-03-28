import type { PostService } from './services/PostService.js';

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute

export function startScheduler(postService: PostService, intervalMs = DEFAULT_INTERVAL_MS): NodeJS.Timeout {
  const tick = async () => {
    try {
      const count = await postService.publishScheduled();
      if (count > 0) {
        console.log(`[scheduler] Published ${count} scheduled post(s).`);
      }
    } catch (err) {
      console.error('[scheduler] Error publishing scheduled posts:', err);
    }
  };

  // Run immediately on start
  void tick();

  return setInterval(tick, intervalMs);
}
