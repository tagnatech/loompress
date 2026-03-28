import { Entity, PrimaryKey, Property, ManyToOne } from '@tagna/udiot/database';
import { Site } from './Site.js';
import { Post } from './Post.js';

@Entity({ tableName: 'lp_comments' })
export class Comment {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @ManyToOne(() => Post, { fieldName: 'post_id', deleteRule: 'cascade' })
  post!: Post;

  @ManyToOne(() => Comment, { fieldName: 'parent_id', nullable: true, deleteRule: 'cascade' })
  parent?: Comment;

  @Property({ fieldName: 'author_name' })
  authorName!: string;

  @Property({ fieldName: 'author_email' })
  authorEmail!: string;

  @Property({ nullable: true, fieldName: 'author_url' })
  authorUrl?: string;

  @Property({ type: 'text' })
  body!: string;

  @Property({ default: 'pending' })
  status: string = 'pending';

  @Property({ nullable: true, fieldName: 'ip_address' })
  ipAddress?: string;

  @Property({ nullable: true, fieldName: 'user_agent' })
  userAgent?: string;

  @Property({ fieldName: 'created_at', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();
}

