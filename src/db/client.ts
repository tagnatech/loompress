import {
  createMikroOrm,
  type EntityManager,
  type MikroORM,
  type Transaction,
} from '@tagna/udiot/database';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface QueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  connect(): Promise<QueryClient>;
  end(force?: boolean): Promise<void>;
  orm: MikroORM;
}

interface PreparedSql {
  sql: string;
  params: unknown[];
}

function normalizeResult<T>(result: unknown): QueryResult<T> {
  if (Array.isArray(result)) {
    return { rows: result as T[], rowCount: result.length };
  }

  if (result && typeof result === 'object') {
    const record = result as {
      rows?: T[];
      rowCount?: number;
      affectedRows?: number;
    };

    if (Array.isArray(record.rows)) {
      return {
        rows: record.rows,
        rowCount: typeof record.rowCount === 'number' ? record.rowCount : record.rows.length,
      };
    }

    if (typeof record.affectedRows === 'number') {
      return { rows: [], rowCount: record.affectedRows };
    }

    if (typeof record.rowCount === 'number') {
      return { rows: [], rowCount: record.rowCount };
    }
  }

  return { rows: [], rowCount: 0 };
}

function trimSql(sql: string): string {
  return sql.trim().replace(/;$/, '').toUpperCase();
}

function prepareSql(sql: string, params: unknown[] = []): PreparedSql {
  const rewrittenParams: unknown[] = [];
  const rewrittenSql = sql.replace(/\$(\d+)/g, (_match, indexText: string) => {
    const index = Number(indexText) - 1;
    rewrittenParams.push(params[index]);
    return '?';
  });

  return {
    sql: rewrittenSql,
    params: rewrittenParams.length > 0 ? rewrittenParams : params,
  };
}

function createQueryClient(orm: MikroORM, em: EntityManager, tx: Transaction | null = null): QueryClient {
  const connection = em.getConnection();

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const statement = trimSql(sql);

      if (statement === 'BEGIN') {
        return { rows: [], rowCount: 0 };
      }

      if (statement === 'COMMIT') {
        if (tx) {
          await connection.commit(tx);
        }
        return { rows: [], rowCount: 0 };
      }

      if (statement === 'ROLLBACK') {
        if (tx) {
          await connection.rollback(tx);
        }
        return { rows: [], rowCount: 0 };
      }

      const prepared = prepareSql(sql, params);
      const result = await connection.execute<T>(prepared.sql, prepared.params, undefined, tx ?? undefined);
      return normalizeResult<T>(result);
    },
    release() {
      void orm;
    },
  };
}

function createDatabaseClient(orm: MikroORM, em: EntityManager = orm.em): DatabaseClient {
  return {
    orm,
    query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> => {
      const prepared = prepareSql(sql, params);
      const result = await em.getConnection().execute<T>(prepared.sql, prepared.params);
      return normalizeResult<T>(result);
    },
    connect: async (): Promise<QueryClient> => {
      const connection = em.getConnection();
      const tx = await connection.begin();
      const transactionalEm = em.fork();
      return createQueryClient(orm, transactionalEm, tx);
    },
    end: async (force = true): Promise<void> => {
      await orm.close(force);
    },
  };
}

export async function getDatabaseClient(databaseUrl: string): Promise<DatabaseClient> {
  const orm = await createMikroOrm({
    type: databaseUrl.includes('supabase') ? 'supabase' : 'postgresql',
    clientUrl: databaseUrl,
    allowGlobalContext: true,
    discovery: { warnWhenNoEntities: false },
    entities: [],
  });

  return createDatabaseClient(orm);
}
