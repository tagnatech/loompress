import { Entity, PrimaryKey, Property, ManyToOne, Unique } from '@tagna/udiot/database';
import { Site } from './Site.js';

@Entity({ tableName: 'lp_settings' })
@Unique({ properties: ['site', 'key'] })
export class Setting {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Site, { fieldName: 'site_id', deleteRule: 'cascade' })
  site!: Site;

  @Property()
  key!: string;

  @Property({ nullable: true, type: 'text' })
  value?: string;
}

