import type pg from 'pg';

export interface MenuItem {
  label: string;
  url: string;
  target?: '_blank' | '_self';
  children?: MenuItem[];
}

export interface MenuRecord {
  id: string;
  site_id: string;
  location: string;
  items: MenuItem[];
}

export class MenuService {
  constructor(private pool: pg.Pool) {}

  async get(siteId: string, location: string): Promise<MenuItem[]> {
    const { rows } = await this.pool.query<MenuRecord>(
      'SELECT * FROM lp_menus WHERE site_id = $1 AND location = $2',
      [siteId, location],
    );
    return rows[0]?.items ?? [];
  }

  async getAll(siteId: string): Promise<MenuRecord[]> {
    const { rows } = await this.pool.query<MenuRecord>(
      'SELECT * FROM lp_menus WHERE site_id = $1 ORDER BY location',
      [siteId],
    );
    return rows;
  }

  async save(siteId: string, location: string, items: MenuItem[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO lp_menus (site_id, location, items)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, location) DO UPDATE SET items = $3`,
      [siteId, location, JSON.stringify(items)],
    );
  }

  async delete(siteId: string, location: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM lp_menus WHERE site_id = $1 AND location = $2',
      [siteId, location],
    );
  }
}

