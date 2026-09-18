import type { FlowDefinition } from '@relay/engine';
import { FLOW_ID, defaultFlow } from '@/lib/default-flow';
import type { ExecutionRecord, ExecutionSummary, FlowBackend, FlowState, RunResult } from '@/lib/backend';

export interface ServerBackendOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface EnqueueResponse {
  executionId: string;
}

interface ExecutionResponse {
  state: string;
  reason?: string;
  execution?: { execution: ExecutionRecord['execution']; definition: FlowDefinition };
}

export function createServerBackend({
  baseUrl,
  fetch: doFetch = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  pollIntervalMs = 400,
  timeoutMs = 30_000,
}: ServerBackendOptions): FlowBackend {
  const root = baseUrl.replace(/\/+$/, '');

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${root}${path}`, {
        ...init,
        headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
      });
    } catch {
      throw new ApiError(0, 'api_inacessivel', `não foi possível falar com a API em ${root}`);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(response.status, 'resposta_malformada', 'a API devolveu texto que não é JSON');
      }
    }

    if (!response.ok) {
      const data = (body ?? {}) as { code?: unknown; message?: unknown };
      const code = typeof data.code === 'string' ? data.code : `http_${response.status}`;
      const message = typeof data.message === 'string' ? data.message : `a API respondeu HTTP ${response.status}`;
      throw new ApiError(response.status, code, message);
    }

    return body as T;
  }

  function put(state: FlowState): Promise<unknown> {
    return call(`/flows/${FLOW_ID}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: state.name,
        definition: { nodes: state.definition.nodes, edges: state.definition.edges },
        layout: state.layout,
      }),
    });
  }

  return {
    mode: 'servidor',
    label: `API em ${root} · fila BullMQ · C# no node-host`,

    async load(): Promise<FlowState> {
      try {
        const flow = await call<FlowState>(`/flows/${FLOW_ID}`);
        return { name: flow.name, definition: flow.definition, layout: flow.layout };
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        const state: FlowState = {
          name: defaultFlow.definition.name,
          definition: defaultFlow.definition,
          layout: defaultFlow.layout,
        };
        await put(state);
        return state;
      }
    },

    async save(state: FlowState): Promise<void> {
      await put(state);
    },

    async run(state: FlowState, trigger: Record<string, unknown>): Promise<RunResult> {
      await put(state);
      const { executionId } = await call<EnqueueResponse>(`/flows/${FLOW_ID}/executions`, {
        method: 'POST',
        body: JSON.stringify(trigger),
      });

      const started = now();
      for (;;) {
        const result = await call<ExecutionResponse>(`/executions/${executionId}`);

        if (result.state === 'concluida' && result.execution) {
          return {
            record: { execution: result.execution.execution, definition: result.execution.definition },
            note: `execução ${executionId} concluída em ${now() - started} ms desde o disparo`,
          };
        }

        if (result.state === 'falhou_na_infra') {
          throw new ApiError(500, 'falhou_na_infra', result.reason ?? 'o job falhou antes de produzir uma execução');
        }

        if (now() - started > timeoutMs) {
          throw new ApiError(504, 'espera_esgotada', `a execução ${executionId} não terminou em ${timeoutMs} ms`);
        }

        await sleep(pollIntervalMs);
      }
    },

    listExecutions(): Promise<ExecutionSummary[]> {
      return call<ExecutionSummary[]>(`/flows/${FLOW_ID}/executions`);
    },

    async getExecution(id: string): Promise<ExecutionRecord | null> {
      const result = await call<ExecutionResponse>(`/executions/${id}`);
      if (result.state !== 'concluida' || !result.execution) return null;
      return { execution: result.execution.execution, definition: result.execution.definition };
    },
  };
}