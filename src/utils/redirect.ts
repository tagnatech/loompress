import type { Request, Response } from 'express';

export function redirectBackOr(req: Request, res: Response, fallback: string): void {
  const referer = req.get('referer') ?? req.get('referrer');

  if (!referer) {
    res.redirect(fallback);
    return;
  }

  try {
    const url = new URL(referer);
    const sameHost = url.host === req.get('host');
    if (!sameHost) {
      res.redirect(fallback);
      return;
    }

    const path = `${url.pathname}${url.search}`;
    if (!path.startsWith('/')) {
      res.redirect(fallback);
      return;
    }

    res.redirect(path);
  } catch {
    res.redirect(fallback);
  }
}
