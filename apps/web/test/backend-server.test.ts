import type { Execution, FlowDefinition } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { ApiError, createServerBackend } from '../lib/backend-server';

const definition: FlowDefinition = { id: 'principal', name: 'F', nodes: [], edges: [] };
const execution: Execution = { flowId: 'principal', status: 'sucesso', startedAt: 1, durationMs: 2, steps: [], issues: [] };
const state = { name: 'F', definition, layout: {} };

type Route = { status: number; body?: unknown };

function backendWith(routes: (key: string, call: number) => Route) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const counts = new Map<string, number>();

  const doFetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = url.replace('http://api', '');
    const key = `${method} ${path}`;
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const route = routes(key, n);
    return new Response(route.body === undefined ? '' : JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;

  let clock = 0;
  const backend = createServerBackend({
    baseUrl: 'http://api',
    fetch: doFetch,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    pollIntervalMs: 100,
    timeoutMs: 1000,
  });

  return { backend, calls };
}

describe('backend em modo servidor', () => {
  it('salva o fluxo antes de enfileirar e devolve a execução concluída', async () => {
    const { backend, calls } = backendWith((key, n) => {
      if (key === 'PUT /flows/principal') return { status: 200, body: { id: 'principal', issues: [] } };
      if (key === 'POST /flows/principal/executions') return { status: 202, body: { executionId: 'e1' } };
      if (key === 'GET /executions/e1') {
        return n < 3
          ? { status: 202, body: { state: n === 1 ? 'enfileirada' : 'executando' } }
          : { status: 200, body: { state: 'concluida', execution: { execution, definition } } };
      }
      return { status: 404, body: { code: 'rota', message: 'x' } };
    });

    const { record } = await backend.run(state, { nome: 'Arthur' });

    expect(record.execution.status).toBe('sucesso');
    expect(calls.map((c) => `${c.method} ${c.path}`).slice(0, 2)).toEqual([
      'PUT /flows/principal',
      'POST /flows/principal/executions',
    ]);
    expect(calls[1]?.body).toEqual({ nome: 'Arthur' });
  });

  it('desiste depois do tempo limite em vez de esperar para sempre', async () => {
    const { backend } = backendWith((key) => {
      if (key === 'PUT /flows/principal') return { status: 200, body: {} };
      if (key === 'POST /flows/principal/executions') return { status: 202, body: { executionId: 'e1' } };
      return { status: 202, body: { state: 'executando' } };
    });

    await expect(backend.run(state, {})).rejects.toThrow('espera_esgotada');
  });

  it('falha de infraestrutura no job vira erro, não execução vazia', async () => {
    const { backend } = backendWith((key) => {
      if (key === 'PUT /flows/principal') return { status: 200, body: {} };
      if (key === 'POST /flows/principal/executions') return { status: 202, body: { executionId: 'e1' } };
      return { status: 200, body: { state: 'falhou_na_infra', reason: 'banco fora do ar' } };
    });

    await expect(backend.run(state, {})).rejects.toThrow('banco fora do ar');
  });

  it('preserva o código de erro que a API mandou', async () => {
    const { backend } = backendWith(() => ({ status: 400, body: { code: 'corpo_invalido', message: 'nome vazio' } }));

    await expect(backend.save(state)).rejects.toMatchObject({ code: 'corpo_invalido', status: 400 });
  });

  it('cria o fluxo de exemplo quando a API responde 404 na carga', async () => {
    const { backend, calls } = backendWith((key) => {
      if (key === 'GET /flows/principal') return { status: 404, body: { code: 'fluxo_inexistente', message: 'não existe' } };
      return { status: 200, body: { id: 'principal', issues: [] } };
    });

    const loaded = await backend.load();

    expect(loaded.definition.nodes).toHaveLength(4);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
  });

  it('API fora do ar vira api_inacessivel', async () => {
    const backend = createServerBackend({
      baseUrl: 'http://api',
      fetch: (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch,
    });

    await expect(backend.listExecutions()).rejects.toBeInstanceOf(ApiError);
  });
});