import { loadEnvFile } from '../config/env-file.js';
import { runMigrations } from './run-migrations.js';

async function migrate() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const isReset = process.argv.includes('--reset');

  try {
    await runMigrations(databaseUrl, { reset: isReset, log: console.log });
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();

