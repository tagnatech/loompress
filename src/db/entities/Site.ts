import {
  Entity, PrimaryKey, Property, OneToMany, Collection,
} from '@tagna/udiot/database';

@Entity({ tableName: 'lp_sites' })
export class Site {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ unique: true })
  hostname!: string;

  @Property()
  name!: string;

  @Property({ unique: true })
  slug!: string;

  @Property({ nullable: true })
  tagline?: string;

  @Property({ nullable: true, fieldName: 'logo_url' })
  logoUrl?: string;

  @Property({ fieldName: 'base_url' })
  baseUrl!: string;

  @Property({ default: 'UTC' })
  timezone: string = 'UTC';

  @Property({ fieldName: 'permalink_pattern', default: 'slug' })
  permalinkPattern: string = 'slug';

  @Property({ default: 'default' })
  theme: string = 'default';

  @Property({ nullable: true, fieldName: 'custom_css', type: 'text' })
  customCss?: string;

  @Property({ fieldName: 'created_at', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ fieldName: 'updated_at', defaultRaw: 'NOW()', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}

