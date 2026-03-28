import type pg from 'pg';
import { hashPassword, verifyPassword } from '../auth/password.js';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  created_at: Date;
  last_login_at: Date | null;
}

export interface SiteUserRecord extends UserRecord {
  site_role: string;
}

export interface CreateUserDto {
  email: string;
  password: string;
  display_name: string;
  role?: string;
}

export class UserService {
  constructor(private pool: pg.Pool) {}

  async hasAnyUsers(): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM lp_users LIMIT 1',
    );
    return rows.length > 0;
  }

  async authenticate(email: string, password: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      'SELECT * FROM lp_users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    if (!user) return null;

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return null;

    // Update last_login_at
    await this.pool.query(
      'UPDATE lp_users SET last_login_at = NOW() WHERE id = $1',
      [user.id],
    );

    return user;
  }

  async getById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      'SELECT * FROM lp_users WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async getSiteUsers(siteId: string): Promise<SiteUserRecord[]> {
    const { rows } = await this.pool.query<SiteUserRecord>(
      `SELECT u.*, su.role AS site_role
       FROM lp_users u
       JOIN lp_site_users su ON u.id = su.user_id
       WHERE su.site_id = $1
       ORDER BY u.display_name`,
      [siteId],
    );
    return rows;
  }

  async getSiteUser(siteId: string, userId: string): Promise<SiteUserRecord | null> {
    const { rows } = await this.pool.query<SiteUserRecord>(
      `SELECT u.*, su.role AS site_role
       FROM lp_users u
       JOIN lp_site_users su ON u.id = su.user_id
       WHERE su.site_id = $1 AND su.user_id = $2`,
      [siteId, userId],
    );
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query<UserRecord>(
      'SELECT * FROM lp_users WHERE email = $1',
      [email],
    );
    return rows[0] ?? null;
  }

  async create(data: CreateUserDto): Promise<UserRecord> {
    const passwordHash = await hashPassword(data.password);
    const { rows } = await this.pool.query<UserRecord>(
      `INSERT INTO lp_users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.email, passwordHash, data.display_name, data.role === 'superadmin' ? 'superadmin' : 'author'],
    );
    return rows[0];
  }

  async addToSite(userId: string, siteId: string, role: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO lp_site_users (site_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, user_id) DO UPDATE SET role = $3`,
      [siteId, userId, role],
    );
  }

  async removeFromSite(userId: string, siteId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM lp_site_users WHERE site_id = $1 AND user_id = $2',
      [siteId, userId],
    );
  }

  async updateRole(userId: string, siteId: string, role: string): Promise<void> {
    await this.pool.query(
      'UPDATE lp_site_users SET role = $1 WHERE site_id = $2 AND user_id = $3',
      [role, siteId, userId],
    );
  }

  async getUserSites(userId: string): Promise<Array<{ site_id: string; role: string }>> {
    const { rows } = await this.pool.query(
      'SELECT site_id, role FROM lp_site_users WHERE user_id = $1',
      [userId],
    );
    return rows;
  }

  async getSiteRole(userId: string, siteId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ role: string }>(
      'SELECT role FROM lp_site_users WHERE user_id = $1 AND site_id = $2',
      [userId, siteId],
    );
    return rows[0]?.role ?? null;
  }

  async hasSiteAccess(userId: string, siteId: string): Promise<boolean> {
    const user = await this.getById(userId);
    if (user?.role === 'superadmin') {
      return true;
    }

    const siteRole = await this.getSiteRole(userId, siteId);
    return Boolean(siteRole);
  }
}

