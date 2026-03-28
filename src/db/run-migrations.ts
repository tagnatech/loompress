import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

export interface RunMigrationsOptions {
  reset?: boolean;
  log?: (...args: unknown[]) => void;
}

export async function runMigrations(
  databaseUrl: string,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const log = options.log ?? (() => {});

  try {
    if (options.reset) {
      log('Resetting all LoomPress tables...');
      await pool.query(`
        DROP TABLE IF EXISTS cms_post_tags CASCADE;
        DROP TABLE IF EXISTS cms_post_categories CASCADE;
        DROP TABLE IF EXISTS cms_media CASCADE;
        DROP TABLE IF EXISTS cms_tags CASCADE;
        DROP TABLE IF EXISTS cms_categories CASCADE;
        DROP TABLE IF EXISTS cms_posts CASCADE;
        DROP TABLE IF EXISTS cms_comments CASCADE;
        DROP TABLE IF EXISTS cms_settings CASCADE;
        DROP TABLE IF EXISTS cms_menus CASCADE;
        DROP TABLE IF EXISTS cms_site_users CASCADE;
        DROP TABLE IF EXISTS cms_sessions CASCADE;
        DROP TABLE IF EXISTS cms_users CASCADE;
        DROP TABLE IF EXISTS cms_sites CASCADE;
        DROP TABLE IF EXISTS lp_post_tags CASCADE;
        DROP TABLE IF EXISTS lp_post_categories CASCADE;
        DROP TABLE IF EXISTS lp_media CASCADE;
        DROP TABLE IF EXISTS lp_tags CASCADE;
        DROP TABLE IF EXISTS lp_categories CASCADE;
        DROP TABLE IF EXISTS lp_posts CASCADE;
        DROP TABLE IF EXISTS lp_comments CASCADE;
        DROP TABLE IF EXISTS lp_settings CASCADE;
        DROP TABLE IF EXISTS lp_menus CASCADE;
        DROP TABLE IF EXISTS lp_site_users CASCADE;
        DROP TABLE IF EXISTS lp_sessions CASCADE;
        DROP TABLE IF EXISTS lp_users CASCADE;
        DROP TABLE IF EXISTS lp_sites CASCADE;
        DROP TABLE IF EXISTS _cms_migrations CASCADE;
        DROP TABLE IF EXISTS _lp_migrations CASCADE;
      `);
      log('All LoomPress tables dropped.');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS _lp_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: applied } = await pool.query(
      'SELECT filename FROM _lp_migrations ORDER BY filename',
    );
    const appliedSet = new Set(applied.map((row: { filename: string }) => row.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        log(`  skip: ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      log(`  applying: ${file}`);
      await pool.query(sql);
      await pool.query(
        'INSERT INTO _lp_migrations (filename) VALUES ($1)',
        [file],
      );
      log(`  done: ${file}`);
    }
  } finally {
    await pool.end();
  }
}
