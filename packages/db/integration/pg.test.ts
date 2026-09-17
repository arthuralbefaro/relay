import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Execution, FlowDefinition } from '@relay/engine';
import pg from 'pg';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepository, migrate, pendingMigrations, type Repository } from '../src/index';
import { pgMigrationClient, pgQuery } from '../src/pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = join(root, '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const schema = `relay_test_${process.pid}_${Date.now()}`;

const definition: FlowDefinition = {
  id: 'f1',
  name: 'Fluxo 1',
  nodes: [{ id: 'a', type: 'hello', runtime: 'dotnet', config: { name: '=trigger.nome' } }],
  edges: [],
};
const flow = { id: 'f1', name: 'Fluxo 1', definition, layout: { a: { x: 1, y: 2 } } };

const execution = (startedAt: number, status: Execution['status']): Execution => ({
  flowId: 'f1',
  status,
  startedAt,
  durationMs: 7,
  issues: [],
  steps: [],
});

let admin: Pool;
let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env e rode "pnpm infra".');
  }
  admin = new pg.Pool({ connectionString: url });
  await admin.query(`create schema ${schema}`);
  pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  await migrate(pgMigrationClient(pool));
  repo = createRepository(pgQuery(pool), () => 1000);
}, 30_000);

afterAll(async () => {
  await pool?.end();
  await admin?.query(`drop schema if exists ${schema} cascade`);
  await admin?.end();
});

describe('Postgres real via node-postgres', () => {
  it('não sobra migration pendente e migrar de novo não faz nada', async () => {
    expect(await pendingMigrations(pgMigrationClient(pool))).toEqual([]);
    expect(await migrate(pgMigrationClient(pool))).toEqual([]);
  });

  it('bigint volta como number e jsonb é gravado como objeto', async () => {
    await repo.saveFlow(flow);
    const saved = await repo.getFlow('f1');
    expect(saved).toEqual({ ...flow, updatedAt: 1000 });
    expect(typeof saved?.updatedAt).toBe('number');

    const { rows } = await pool.query("select jsonb_typeof(definition) as tipo from flows where id = 'f1'");
    expect(rows[0]).toEqual({ tipo: 'object' });
  });

  it('execução faz ida e volta e a segunda gravação do mesmo id é ignorada', async () => {
    await repo.saveFlow(flow);
    await repo.saveExecution({ id: 'e1', flowId: 'f1', trigger: { nome: 'A' }, definition, execution: execution(5, 'falhou') });
    await repo.saveExecution({ id: 'e1', flowId: 'f1', trigger: {}, definition, execution: execution(9, 'sucesso') });

    const saved = await repo.getExecution('e1');
    expect(saved?.status).toBe('falhou');
    expect(saved?.startedAt).toBe(5);
    expect(saved?.trigger).toEqual({ nome: 'A' });
    expect(await repo.listExecutions('f1')).toHaveLength(1);
  });

  it('transação desfaz tudo quando dá erro no meio', async () => {
    const client = pgMigrationClient(pool);
    await expect(
      client.transaction(async (tx) => {
        await tx.exec('create table rollback_teste (id int)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const { rows } = await pool.query("select to_regclass('rollback_teste') is null as sumiu");
    expect(rows[0]).toEqual({ sumiu: true });
  });
});