import pg from 'pg';
import { loadEnvFile } from '../config/env-file.js';
import { getAvailableThemes } from '../public/theme-resolver.js';
import { normalizeBaseUrl, normalizeHostname, slugify } from '../utils/validation.js';

const { Pool } = pg;

async function seedSite() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const hostname = getArg('hostname');
  const name = getArg('name');
  const slug = getArg('slug');
  const baseUrl = getArg('base-url');
  const theme = getArg('theme') ?? 'default';

  if (!hostname || !name || !slug || !baseUrl) {
    console.error('Usage: npm run seed:site -- --hostname <host> --name <name> --slug <slug> --base-url <url> [--theme <theme>]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const normalizedTheme = theme.trim();
    if (!getAvailableThemes().includes(normalizedTheme)) {
      console.error(`Invalid theme "${normalizedTheme}". Available themes: ${getAvailableThemes().join(', ')}`);
      process.exit(1);
    }

    const { rows } = await pool.query(
      `INSERT INTO lp_sites (hostname, name, slug, base_url, theme)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, hostname, name, slug, base_url, theme`,
      [normalizeHostname(hostname), name.trim(), slugify(slug), normalizeBaseUrl(baseUrl), normalizedTheme],
    );
    console.log('Site created:', rows[0]);
  } catch (err: any) {
    if (err.constraint) {
      console.error('A site with that hostname or slug already exists.');
    } else {
      console.error('Failed to seed site:', err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedSite();

