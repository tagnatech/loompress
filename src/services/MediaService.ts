import type pg from 'pg';
import fs from 'node:fs';

export interface MediaRecord {
  id: string;
  site_id: string;
  uploaded_by: string | null;
  filename: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  created_at: Date;
}

export class MediaService {
  constructor(private pool: pg.Pool) {}

  async getAll(siteId: string): Promise<MediaRecord[]> {
    const { rows } = await this.pool.query<MediaRecord>(
      'SELECT * FROM lp_media WHERE site_id = $1 ORDER BY created_at DESC',
      [siteId],
    );
    return rows;
  }

  async getById(siteId: string, id: string): Promise<MediaRecord | null> {
    const { rows } = await this.pool.query<MediaRecord>(
      'SELECT * FROM lp_media WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return rows[0] ?? null;
  }

  async create(siteId: string, uploadedBy: string, file: {
    filename: string;
    storagePath: string;
    publicUrl: string;
    mimeType: string;
    fileSize: number;
  }): Promise<MediaRecord> {
    const { rows } = await this.pool.query<MediaRecord>(
      `INSERT INTO lp_media (site_id, uploaded_by, filename, storage_path, public_url, mime_type, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [siteId, uploadedBy, file.filename, file.storagePath, file.publicUrl, file.mimeType, file.fileSize],
    );
    return rows[0];
  }

  async updateAltText(siteId: string, id: string, altText: string): Promise<MediaRecord | null> {
    const { rows } = await this.pool.query<MediaRecord>(
      'UPDATE lp_media SET alt_text = $1 WHERE site_id = $2 AND id = $3 RETURNING *',
      [altText, siteId, id],
    );
    return rows[0] ?? null;
  }

  async delete(siteId: string, id: string): Promise<boolean> {
    const media = await this.getById(siteId, id);
    if (!media) return false;

    // Delete file from disk
    try {
      if (fs.existsSync(media.storage_path)) {
        fs.unlinkSync(media.storage_path);
      }
    } catch {
      // File may already be gone
    }

    const { rowCount } = await this.pool.query(
      'DELETE FROM lp_media WHERE site_id = $1 AND id = $2',
      [siteId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}

