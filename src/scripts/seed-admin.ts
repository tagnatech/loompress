import pg from 'pg';
import { hashPassword } from '../auth/password.js';
import { loadEnvFile } from '../config/env-file.js';
import { normalizeEmail } from '../utils/validation.js';

const { Pool } = pg;
const MIN_PASSWORD_LENGTH = 10;

async function seedAdmin() {
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

  const email = getArg('email');
  const password = getArg('password');
  const displayName = getArg('name') ?? 'Admin';

  if (!email || !password) {
    console.error('Usage: npm run seed:admin -- --email <email> --password <password> [--name <name>]');
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO lp_users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'superadmin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, display_name = $3, role = 'superadmin'
       RETURNING id, email, display_name, role`,
      [normalizeEmail(email), passwordHash, displayName],
    );
    console.log('Superadmin user created/updated:', rows[0]);
  } catch (err) {
    console.error('Failed to seed admin:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();

