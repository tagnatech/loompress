import type { Request } from 'express';

/** Extract a route parameter as string (Express 5 returns string | string[]). */
export function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}
