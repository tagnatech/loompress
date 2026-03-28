import { describe, expect, it } from 'vitest';
import { parseEnvContent } from './env-file.js';

describe('env file parsing', () => {
  it('parses quoted and unquoted values', () => {
    const parsed = parseEnvContent([
      'DATABASE_URL=postgresql://localhost:5432/loompress',
      'SESSION_SECRET=\"abc 123\"',
      'ADMIN_BASE_URL=https://example.com # comment',
    ].join('\n'));

    expect(parsed.DATABASE_URL).toBe('postgresql://localhost:5432/loompress');
    expect(parsed.SESSION_SECRET).toBe('abc 123');
    expect(parsed.ADMIN_BASE_URL).toBe('https://example.com');
  });
});
