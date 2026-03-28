import {
  Entity, PrimaryKey, Property, ManyToOne, ManyToMany, Collection, Unique,
} from '@tagna/udiot/database';
import { Site } from './Site.js';

@Entity({ tableName: 'lp_categories' })
@Unique({ properties: ['site', 'slug'] })
export class Category {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @ManyToOne(() => Category, { fieldName: 'parent_id', nullable: true, deleteRule: 'set null' })
  parent?: Category;

  @Property()
  name!: string;

  @Property()
  slug!: string;

  @Property({ nullable: true, type: 'text' })
  description?: string;

  @ManyToMany(() => require('./Post.js').Post, 'categories')
  posts = new Collection<any>(this);
}

