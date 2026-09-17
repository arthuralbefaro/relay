export interface Migration {
  id: string;
  sql: string;
}

// Fonte de verdade do DDL. Nunca edite uma migration já publicada: crie a próxima.
export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_flows_e_execucoes',
    sql: `
      create table flows (
        id text primary key,
        name text not null,
        definition jsonb not null,
        layout jsonb not null,
        updated_at bigint not null
      );

      create table executions (
        id text primary key,
        flow_id text not null references flows(id) on delete cascade,
        status text not null check (status in ('sucesso', 'falhou', 'invalida')),
        started_at bigint not null,
        duration_ms integer not null,
        trigger jsonb not null,
        definition jsonb not null,
        steps jsonb not null,
        issues jsonb not null
      );

      create index executions_flow_started_idx on executions (flow_id, started_at desc);
    `,
  },
];

export interface MigrationTx {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface MigrationClient extends MigrationTx {
  transaction<T>(fn: (tx: MigrationTx) => Promise<T>): Promise<T>;
}

export async function migrate(client: MigrationClient): Promise<string[]> {
  await client.exec('create table if not exists _relay_migrations (id text primary key, applied_at bigint not null)');
  const { rows } = await client.query('select id from _relay_migrations');
  const applied = new Set((rows as { id: string }[]).map((r) => r.id));

  // Banco mais novo que o código não pode seguir calado: as queries quebrariam depois, longe da causa.
  const known = new Set(MIGRATIONS.map((m) => m.id));
  const unknown = [...applied].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`o banco tem migrations que este código não conhece: ${unknown.join(', ')}`);
  }

  const done: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await client.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query('insert into _relay_migrations (id, applied_at) values ($1, $2)', [migration.id, Date.now()]);
    });
    done.push(migration.id);
  }
  return done;
}