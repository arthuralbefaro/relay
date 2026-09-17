import { ResolveError, resolveInput } from './resolve';
import type {
  AttemptLog, EngineDeps, Execution, FlowDefinition, NodeExecutor,
  NodeResult, NodeRuntime, RetryPolicy, StepLog, StepStatus,
} from './types';
import { validateFlow } from './validate';

const RETRYABLE = new Set(['falha_interna', 'executor_indisponivel']);
const NO_RETRY: RetryPolicy = { maxAttempts: 1, backoffMs: 0 };

export async function runFlow(flow: FlowDefinition, trigger: unknown, deps: EngineDeps): Promise<Execution> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const startedAt = now();

  const available = (Object.keys(deps.executors) as NodeRuntime[]).filter((r) => deps.executors[r]);
  const { issues, order, parents } = validateFlow(flow, available);
  if (issues.length > 0) {
    return { flowId: flow.id, status: 'invalida', startedAt, durationMs: now() - startedAt, steps: [], issues };
  }

  const nodesById = new Map(flow.nodes.map((n) => [n.id, n]));
  const steps: StepLog[] = [];
  const statusById = new Map<string, StepStatus>();
  const outputs: Record<string, unknown> = {};

  const record = (step: StepLog) => {
    steps.push(step);
    statusById.set(step.nodeId, step.status);
  };

  for (const id of order) {
    const node = nodesById.get(id)!;
    const base = { nodeId: id, type: node.type, runtime: node.runtime };

    const blocker = parents.get(id)!.find((p) => statusById.get(p) !== 'sucesso');
    if (blocker) {
      record({ ...base, status: 'pulado', attempts: [], skippedBecause: `'${blocker}' ${statusById.get(blocker)}` });
      continue;
    }

    let input: unknown;
    try {
      input = resolveInput(node.config ?? {}, { trigger, steps: outputs });
    } catch (err) {
      if (!(err instanceof ResolveError)) throw err;
      record({ ...base, status: 'falhou', attempts: [], error: { code: 'referencia_invalida', message: err.message } });
      continue;
    }

    const executor = deps.executors[node.runtime]!;
    const policy = node.retry ?? NO_RETRY;
    const attempts: AttemptLog[] = [];

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      const t0 = now();
      const result = await callExecutor(executor, node.type, input);
      attempts.push({ attempt, startedAt: t0, durationMs: now() - t0, result });

      if (result.ok || !RETRYABLE.has(result.error.code) || attempt === policy.maxAttempts) break;
      await sleep(policy.backoffMs * 2 ** (attempt - 1));
    }

    const last = attempts[attempts.length - 1]!.result;
    if (last.ok) {
      outputs[id] = last.output;
      record({ ...base, status: 'sucesso', attempts, input, output: last.output });
    } else {
      record({ ...base, status: 'falhou', attempts, input, error: last.error });
    }
  }

  return {
    flowId: flow.id,
    status: steps.some((s) => s.status === 'falhou') ? 'falhou' : 'sucesso',
    startedAt,
    durationMs: now() - startedAt,
    steps,
    issues: [],
  };
}

async function callExecutor(executor: NodeExecutor, type: string, input: unknown): Promise<NodeResult> {
  let raw: unknown;
  try {
    raw = await executor.execute(type, input);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'executor_indisponivel',
        message: err instanceof Error ? `${err.name}: ${err.message}` : 'erro desconhecido no executor',
      },
    };
  }
  if (isNodeResult(raw)) return raw;
  return {
    ok: false,
    error: { code: 'resultado_malformado', message: 'o executor devolveu algo fora do formato { ok, output } | { ok, error }' },
  };
}

export function isNodeResult(value: unknown): value is NodeResult {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.ok === true) return Object.hasOwn(r, 'output');
  if (r.ok === false) {
    const e = r.error as Record<string, unknown> | null | undefined;
    return !!e && typeof e === 'object' && typeof e.code === 'string' && typeof e.message === 'string';
  }
  return false;
}