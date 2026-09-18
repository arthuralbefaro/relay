import type { NodeExecutor, NodeResult } from '@relay/engine';

export interface HttpExecutorOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function createHttpDotnetExecutor({ baseUrl, timeoutMs = 10_000, fetch: doFetch = fetch }: HttpExecutorOptions): NodeExecutor {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async execute(nodeType, input) {
      const response = await doFetch(`${root}/nodes/${encodeURIComponent(nodeType)}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input ?? null),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) throw new Error(`node-host respondeu HTTP ${response.status}`);

      const text = await response.text();
      try {
        return JSON.parse(text) as NodeResult;
      } catch {
        return { ok: false, error: { code: 'resultado_malformado', message: 'o node-host devolveu texto que não é JSON' } };
      }
    },
  };
}