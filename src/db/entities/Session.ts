import { Entity, PrimaryKey, Property } from '@tagna/udiot/database';

@Entity({ tableName: 'lp_sessions' })
export class Session {
  @PrimaryKey({ type: 'text' })
  sid!: string;

  @Property({ type: 'jsonb' })
  sess!: Record<string, unknown>;

  @Property()
  expire!: Date;
}

