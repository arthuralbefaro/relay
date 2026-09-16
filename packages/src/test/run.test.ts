import { describe, expect, it } from 'vitest';
import {
  runFlow,
  type EngineDeps, type FlowDefinition, type FlowNode, type NodeExecutor, type NodeResult,
} from '../src/index';

type Handler = (input: unknown, attempt: number) => NodeResult | Promise<NodeResult>;

const ok = (output: unknown): NodeResult => ({ ok: true, output });
const fail = (code: string, message = code): NodeResult => ({ ok: false, error: { code, message } });

function setup(handlers: Record<string, Handler>) {
  const calls: { type: string; input: unknown }[] = [];
  const sleeps: number[] = [];
  const counts = new Map<string, number>();
  const executor: NodeExecutor = {
    async execute(type, input) {
      calls.push({ type, input });
      const attempt = (counts.get(type) ?? 0) + 1;
      counts.set(type, attempt);
      const handler = handlers[type];
      return handler ? handler(input, attempt) : fail('node_desconhecido');
    },
  };
  const deps: EngineDeps = { executors: { ts: executor }, sleep: async (ms) => { sleeps.push(ms); } };
  return { deps, calls, sleeps };
}

const flow = (nodes: FlowNode[], edges: [string, string][] = []): FlowDefinition => ({
  id: 'teste',
  name: 'teste',
  nodes,
  edges: edges.map(([from, to]) => ({ from, to })),
});

const node = (id: string, extra: Partial<FlowNode> = {}): FlowNode => ({ id, type: id, runtime: 'ts', ...extra });

describe('execução', () => {
  it('segue a ordem topológica, não a de declaração, e passa saídas por referência', async () => {
    const { deps } = setup({
      a: (input) => ok({ message: `Olá, ${(input as { name: string }).name}!` }),
      b: (input) => ok({ texto: (input as { texto: string }).texto.toUpperCase() }),
    });
    const exec = await runFlow(
      flow([node('b', { config: { texto: '=steps.a.message' } }), node('a', { config: { name: '=trigger.nome' } })], [['a', 'b']]),
      { nome: 'Arthur' },
      deps,
    );
    expect(exec.status).toBe('sucesso');
    expect(exec.steps.map((s) => s.nodeId)).toEqual(['a', 'b']);
    expect(exec.steps[1]?.output).toEqual({ texto: 'OLÁ, ARTHUR!' });
  });

  it('falha pula os descendentes, mas não o ramo independente', async () => {
    const { deps, calls } = setup({ a: () => fail('entrada_invalida'), b: () => ok(1), c: () => ok(2), d: () => ok(3) });
    const exec = await runFlow(flow([node('a'), node('b'), node('c'), node('d')], [['a', 'b'], ['b', 'c']]), {}, deps);
    expect(exec.status).toBe('falhou');
    expect(exec.steps.map((s) => [s.nodeId, s.status])).toEqual([
      ['a', 'falhou'], ['b', 'pulado'], ['c', 'pulado'], ['d', 'sucesso'],
    ]);
    expect(exec.steps[1]?.skippedBecause).toBe("'a' falhou");
    expect(calls.map((c) => c.type)).toEqual(['a', 'd']);
  });

  it('"==" vira um "=" literal, não uma referência', async () => {
    const { deps } = setup({ a: (input) => ok(input) });
    const exec = await runFlow(flow([node('a', { config: { texto: '==2+2' } })]), {}, deps);
    expect(exec.steps[0]?.output).toEqual({ texto: '=2+2' });
  });

  it('referência ausente no trigger falha sem chamar o executor', async () => {
    const { deps, calls } = setup({ a: () => ok(1) });
    const exec = await runFlow(flow([node('a', { config: { name: '=trigger.nome' } })]), {}, deps);
    expect(exec.steps[0]?.status).toBe('falhou');
    expect(exec.steps[0]?.error?.code).toBe('referencia_invalida');
    expect(calls).toHaveLength(0);
  });
});

describe('retries', () => {
  const retry = { maxAttempts: 3, backoffMs: 100 };

  it('repete falha transitória com backoff exponencial', async () => {
    const { deps, sleeps } = setup({ a: (_, n) => (n < 3 ? fail('falha_interna') : ok('foi')) });
    const exec = await runFlow(flow([node('a', { retry })]), {}, deps);
    expect(exec.status).toBe('sucesso');
    expect(exec.steps[0]?.attempts).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('não repete erro determinístico', async () => {
    const { deps, sleeps } = setup({ a: () => fail('entrada_invalida') });
    const exec = await runFlow(flow([node('a', { retry })]), {}, deps);
    expect(exec.steps[0]?.attempts).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('esgota as tentativas e registra a última falha', async () => {
    const { deps, sleeps } = setup({ a: () => fail('falha_interna') });
    const exec = await runFlow(flow([node('a', { retry: { maxAttempts: 2, backoffMs: 100 } })]), {}, deps);
    expect(exec.steps[0]?.status).toBe('falhou');
    expect(exec.steps[0]?.attempts).toHaveLength(2);
    expect(sleeps).toEqual([100]);
  });

  it('executor que lança exceção vira executor_indisponivel e é repetido', async () => {
    const { deps } = setup({
      a: (_, n) => {
        if (n === 1) throw new Error('rede caiu');
        return ok('voltou');
      },
    });
    const exec = await runFlow(flow([node('a', { retry })]), {}, deps);
    const first = exec.steps[0]?.attempts[0]?.result;
    expect(first?.ok === false && first.error.code).toBe('executor_indisponivel');
    expect(exec.steps[0]?.status).toBe('sucesso');
  });

  it('resultado malformado não é repetido', async () => {
    const { deps } = setup({ a: () => ({ ok: true }) as unknown as NodeResult });
    const exec = await runFlow(flow([node('a', { retry })]), {}, deps);
    expect(exec.steps[0]?.error?.code).toBe('resultado_malformado');
    expect(exec.steps[0]?.attempts).toHaveLength(1);
  });
});

describe('validação: fluxo inválido não executa nada', () => {
  async function issuesOf(definition: FlowDefinition) {
    const { deps, calls } = setup({ a: () => ok(1), b: () => ok(2) });
    const exec = await runFlow(definition, {}, deps);
    expect(exec.status).toBe('invalida');
    expect(calls).toHaveLength(0);
    return exec.issues.map((i) => i.code);
  }

  it('ciclo', async () => {
    expect(await issuesOf(flow([node('a'), node('b')], [['a', 'b'], ['b', 'a']]))).toEqual(['ciclo']);
  });

  it('id duplicado', async () => {
    expect(await issuesOf(flow([node('a'), node('a')]))).toEqual(['id_duplicado']);
  });

  it('referência a nó que não é ancestral', async () => {
    expect(await issuesOf(flow([node('a'), node('b', { config: { x: '=steps.a.valor' } })]))).toEqual(['referencia_nao_ancestral']);
  });

  it('raiz de referência desconhecida', async () => {
    expect(await issuesOf(flow([node('a', { config: { x: '=foo.bar' } })]))).toEqual(['referencia_invalida']);
  });

  it('runtime sem executor registrado', async () => {
    expect(await issuesOf(flow([node('a', { runtime: 'dotnet' })]))).toEqual(['runtime_sem_executor']);
  });

  it('política de retry inválida', async () => {
    expect(await issuesOf(flow([node('a', { retry: { maxAttempts: 0, backoffMs: 0 } })]))).toEqual(['retry_invalido']);
  });
});