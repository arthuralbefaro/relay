import { PGlite } from '@electric-sql/pglite';
import type { Execution, FlowDefinition } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, createRepository, migrate, pendingMigrations, pgliteQuery, type Repository } from '../src/index';

const definition: FlowDefinition = {
  id: 'f1',
  name: 'Fluxo 1',
  nodes: [{ id: 'a', type: 'hello', runtime: 'dotnet', config: { name: '=trigger.nome' } }],
  edges: [],
};
const layout = { a: { x: 10, y: 20 } };
const flow = { id: 'f1', name: 'Fluxo 1', definition, layout };

function execution(startedAt: number): Execution {
  return {
    flowId: 'f1',
    status: 'falhou',
    startedAt,
    durationMs: 5,
    issues: [],
    steps: [
      {
        nodeId: 'a',
        type: 'hello',
        runtime: 'dotnet',
        status: 'falhou',
        attempts: [],
        error: { code: 'entrada_invalida', message: 'nome vazio' },
      },
    ],
  };
}

let client: PGlite;
let repo: Repository;
let clock: number;

beforeEach(async () => {
  client = await PGlite.create();
  await migrate(client);
  clock = 1000;
  repo = createRepository(pgliteQuery(client), () => clock);
}, 30_000);

afterEach(async () => {
  await client.close();
});

describe('migrations', () => {
  it('são idempotentes', async () => {
    expect(await migrate(client)).toEqual([]);
    const { rows } = await client.query<{ total: number }>('select count(*)::int as total from _relay_migrations');
    expect(rows[0]?.total).toBe(MIGRATIONS.length);
  });

  it('pendingMigrations lista tudo num banco novo e nada depois de migrar', async () => {
    const fresh = await PGlite.create();
    try {
      expect(await pendingMigrations(fresh)).toEqual(MIGRATIONS.map((m) => m.id));
      await migrate(fresh);
      expect(await pendingMigrations(fresh)).toEqual([]);
    } finally {
      await fresh.close();
    }
  });

  it('recusam banco com migration que o código não conhece', async () => {
    await client.query('insert into _relay_migrations (id, applied_at) values ($1, $2)', ['9999_do_futuro', 1]);
    await expect(migrate(client)).rejects.toThrow('9999_do_futuro');
  });
});

describe('fluxos', () => {
  it('salva e lê de volta', async () => {
    await repo.saveFlow(flow);
    expect(await repo.getFlow('f1')).toEqual({ ...flow, updatedAt: 1000 });
  });

  // O teste de ida e volta NÃO pega JSON codificado duas vezes: o Drizzle faria JSON.parse
  // na string e devolveria o objeto certo. Só olhando o tipo dentro do Postgres dá para ver.
  it('grava jsonb como objeto, não como string JSON', async () => {
    await repo.saveFlow(flow);
    const { rows } = await client.query<{ tipo: string; nome: string }>(
      "select jsonb_typeof(definition) as tipo, definition->>'name' as nome from flows",
    );
    expect(rows[0]).toEqual({ tipo: 'object', nome: 'Fluxo 1' });
  });

  it('salvar de novo atualiza em vez de duplicar', async () => {
    await repo.saveFlow(flow);
    clock = 2000;
    await repo.saveFlow({ ...flow, name: 'Renomeado' });
    expect(await repo.listFlows()).toEqual([{ id: 'f1', name: 'Renomeado', updatedAt: 2000 }]);
  });

  it('id inexistente devolve null', async () => {
    expect(await repo.getFlow('nao-existe')).toBeNull();
  });
});

describe('execuções', () => {
  it('lista da mais recente para a mais antiga, respeitando o limite', async () => {
    await repo.saveFlow(flow);
    for (const t of [100, 300, 200]) {
      await repo.saveExecution({ id: `e${t}`, flowId: 'f1', trigger: {}, definition, execution: execution(t) });
    }
    expect((await repo.listExecutions('f1', 2)).map((e) => e.id)).toEqual(['e300', 'e200']);
  });

  it('gravar a mesma execução duas vezes mantém a primeira', async () => {
    await repo.saveFlow(flow);
    await repo.saveExecution({ id: 'e1', flowId: 'f1', trigger: {}, definition, execution: execution(1) });
    await repo.saveExecution({
      id: 'e1',
      flowId: 'f1',
      trigger: {},
      definition,
      execution: { ...execution(2), status: 'sucesso' },
    });
    const saved = await repo.getExecution('e1');
    expect(saved?.status).toBe('falhou');
    expect(saved?.startedAt).toBe(1);
  });

  it('lê a execução completa com a cópia da definição', async () => {
    await repo.saveFlow(flow);
    const trigger = { nome: '' };
    await repo.saveExecution({ id: 'e1', flowId: 'f1', trigger, definition, execution: execution(500) });
    expect(await repo.getExecution('e1')).toEqual({
      id: 'e1',
      flowId: 'f1',
      status: 'falhou',
      startedAt: 500,
      durationMs: 5,
      trigger,
      definition,
      execution: execution(500),
    });
  });

  it('execução de fluxo inexistente é recusada pela chave estrangeira', async () => {
    await expect(
      repo.saveExecution({ id: 'e1', flowId: 'nao-existe', trigger: {}, definition, execution: execution(1) }),
    ).rejects.toThrow();
  });

  it('apagar o fluxo apaga as execuções', async () => {
    await repo.saveFlow(flow);
    await repo.saveExecution({ id: 'e1', flowId: 'f1', trigger: {}, definition, execution: execution(1) });
    await repo.deleteFlow('f1');
    const { rows } = await client.query<{ total: number }>('select count(*)::int as total from executions');
    expect(rows[0]?.total).toBe(0);
  });
});