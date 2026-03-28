import { Entity, ManyToOne, PrimaryKeyProp, Property } from '@tagna/udiot/database';
import { Site } from './Site.js';
import { User } from './User.js';

@Entity({ tableName: 'lp_site_users' })
export class SiteUser {
  [PrimaryKeyProp]?: ['site', 'user'];

  @ManyToOne(() => Site, { fieldName: 'site_id', primary: true, deleteRule: 'cascade' })
  site!: Site;

  @ManyToOne(() => User, { fieldName: 'user_id', primary: true, deleteRule: 'cascade' })
  user!: User;

  @Property({ default: 'author' })
  role: string = 'author';
}

