import {
  Entity, PrimaryKey, Property, ManyToOne, ManyToMany, Collection, Unique,
} from '@tagna/udiot/database';
import { Site } from './Site.js';

@Entity({ tableName: 'lp_tags' })
@Unique({ properties: ['site', 'slug'] })
export class Tag {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @Property()
  name!: string;

  @Property()
  slug!: string;

  @ManyToMany(() => require('./Post.js').Post, 'tags')
  posts = new Collection<any>(this);
}

