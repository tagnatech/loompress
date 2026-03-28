import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@tagna/udiot/database';
import { Site } from './Site.js';

@Entity({ tableName: 'lp_menus' })
@Unique({ properties: ['site', 'location'] })
export class Menu {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @Property({ default: 'primary' })
  location: string = 'primary';

  @Property({ type: 'jsonb', default: '[]' })
  items: any[] = [];
}

