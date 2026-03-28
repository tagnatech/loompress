import { Entity, PrimaryKey, Property } from '@tagna/udiot/database';

@Entity({ tableName: 'lp_users' })
export class User {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ unique: true })
  email!: string;

  @Property({ fieldName: 'password_hash' })
  passwordHash!: string;

  @Property({ fieldName: 'display_name' })
  displayName!: string;

  @Property({ default: 'author' })
  role: string = 'author';

  @Property({ nullable: true, fieldName: 'avatar_url' })
  avatarUrl?: string;

  @Property({ fieldName: 'created_at', defaultRaw: 'NOW()' })
  createdAt: Date = new Date();

  @Property({ nullable: true, fieldName: 'last_login_at' })
  lastLoginAt?: Date;
}

