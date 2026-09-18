import type { Repository } from '@relay/db';
import { runFlow } from '@relay/engine';
import { createTsExecutor } from '@relay/nodes';
import { loadDatabase } from '@/lib/db';
import { FLOW_ID, defaultFlow } from '@/lib/default-flow';
import { dotnetExecutor, loadDotnet } from '@/lib/dotnet';
import type { ExecutionRecord, ExecutionSummary, FlowBackend, FlowState, RunResult } from '@/lib/backend';

export async function createBrowserBackend(): Promise<FlowBackend> {
  const repo: Repository = await loadDatabase();
  let runtimeNoted = false;

  return {
    mode: 'navegador',
    label: 'Postgres no navegador (PGlite) · C# em WebAssembly',

    async load(): Promise<FlowState> {
      let saved = await repo.getFlow(FLOW_ID);
      if (!saved) {
        await repo.saveFlow({ id: FLOW_ID, name: defaultFlow.definition.name, ...defaultFlow });
        saved = await repo.getFlow(FLOW_ID);
      }
      if (!saved) throw new Error('o fluxo de exemplo foi salvo, mas não voltou na leitura');
      return { name: saved.name, definition: saved.definition, layout: saved.layout };
    },

    async save(state: FlowState): Promise<void> {
      await repo.saveFlow({ id: FLOW_ID, name: state.name, definition: state.definition, layout: state.layout });
    },

    async run(state: FlowState, trigger: Record<string, unknown>): Promise<RunResult> {
      let note: string | undefined;

      if (state.definition.nodes.some((n) => n.runtime === 'dotnet')) {
        const started = performance.now();
        const dotnet = await loadDotnet();
        if (!runtimeNoted) {
          runtimeNoted = true;
          note = `runtime .NET carregado em ${Math.round(performance.now() - started)} ms · ${dotnet.RuntimeInfo()}`;
        }
      }

      const execution = await runFlow(state.definition, trigger, {
        executors: { ts: createTsExecutor(), dotnet: dotnetExecutor },
      });

      await repo.saveExecution({
        id: crypto.randomUUID(),
        flowId: FLOW_ID,
        trigger,
        definition: state.definition,
        execution,
      });

      return { record: { execution, definition: state.definition }, note };
    },

    listExecutions(): Promise<ExecutionSummary[]> {
      return repo.listExecutions(FLOW_ID);
    },

    async getExecution(id: string): Promise<ExecutionRecord | null> {
      const saved = await repo.getExecution(id);
      return saved ? { execution: saved.execution, definition: saved.definition } : null;
    },
  };
}
