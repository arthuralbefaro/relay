import type { Pool } from 'pg';
import type { MigrationClient, MigrationTx } from './migrations';
import type { QueryFn } from './repository';

type Run = (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

export function pgQuery(pool: Pool): QueryFn {
  return async (sql, params, method) => {
    if (method === 'all') {
      const result = await pool.query({ text: sql, values: params, rowMode: 'array' });
      return { rows: result.rows };
    }
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  };
}

function wrap(run: Run): MigrationTx {
  return {
    exec: (sql) => run(sql),
    query: async (sql, params) => ({ rows: (await run(sql, params)).rows }),
  };
}

export function pgMigrationClient(pool: Pool): MigrationClient {
  return {
    ...wrap((text, values) => pool.query(text, values)),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap((text, values) => client.query(text, values)));
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}