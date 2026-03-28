import { Entity, PrimaryKey, Property, ManyToOne } from '@tagna/udiot/database';
import { Site } from './Site.js';
import { User } from './User.js';

@Entity({ tableName: 'lp_media' })
export class Media {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @ManyToOne(() => User, { fieldName: 'uploaded_by', nullable: true, deleteRule: 'set null' })
  uploadedBy?: User;

  @Property()
  filename!: string;

  @Property({ fieldName: 'storage_path' })
  storagePath!: string;

  @Property({ fieldName: 'public_url' })
  publicUrl!: string;

  @Property({ fieldName: 'mime_type' })
  mimeType!: string;

  @Property({ nullable: true, fieldName: 'file_size' })
  fileSize?: number;

  @Property({ nullable: true })
  width?: number;

  @Property({ nullable: true })
  height?: number;

  @Property({ nullable: true, fieldName: 'alt_text' })
  altText?: string;

  @Property({ fieldName: 'created_at', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}

