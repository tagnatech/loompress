import {
  Entity, PrimaryKey, Property, ManyToOne, ManyToMany, Collection, Unique,
} from '@tagna/udiot/database';
import { Site } from './Site.js';
import { User } from './User.js';
import { Category } from './Category.js';
import { Tag } from './Tag.js';
import { Media } from './Media.js';

@Entity({ tableName: 'lp_posts' })
@Unique({ properties: ['site', 'slug'] })
export class Post {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @ManyToOne(() => User, { fieldName: 'author_id', nullable: true, deleteRule: 'set null' })
  author?: User;

  @Property({ default: 'post' })
  type: string = 'post';

  @Property()
  slug!: string;

  @Property()
  title!: string;

  @Property({ nullable: true, type: 'text' })
  excerpt?: string;

  @Property({ type: 'text', default: '' })
  body: string = '';

  @Property({ default: 'draft' })
  status: string = 'draft';

  @ManyToOne(() => Media, { fieldName: 'featured_image_id', nullable: true, deleteRule: 'set null' })
  featuredImage?: Media;

  @Property({ nullable: true, fieldName: 'meta_title' })
  metaTitle?: string;

  @Property({ nullable: true, fieldName: 'meta_description', type: 'text' })
  metaDescription?: string;

  @Property({ nullable: true, fieldName: 'published_at' })
  publishedAt?: Date;

  @Property({ nullable: true, fieldName: 'scheduled_at' })
  scheduledAt?: Date;

  @Property({ fieldName: 'created_at', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ fieldName: 'updated_at', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @ManyToMany(() => Category, category => category.posts, {
    pivotTable: 'lp_post_categories',
    joinColumn: 'post_id',
    inverseJoinColumn: 'category_id',
  })
  categories = new Collection<Category>(this);

  @ManyToMany(() => Tag, tag => tag.posts, {
    pivotTable: 'lp_post_tags',
    joinColumn: 'post_id',
    inverseJoinColumn: 'tag_id',
  })
  tags = new Collection<Tag>(this);
}

