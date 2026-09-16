'use client';

import { useState } from 'react';
import { runFlow, type Execution, type StepLog } from '@relay/engine';
import { createDemoExecutor } from '@/lib/demo-nodes';
import { demoFlow } from '@/lib/demo-flow';
import { dotnetExecutor, loadDotnet } from '@/lib/dotnet';

type RuntimeState =
  | { status: 'ocioso' | 'carregando' }
  | { status: 'pronto'; info: string; loadMs: number }
  | { status: 'erro'; error: string };

export default function Home() {
  const [nome, setNome] = useState('Arthur');
  const [runtime, setRuntime] = useState<RuntimeState>({ status: 'ocioso' });
  const [running, setRunning] = useState(false);
  const [execution, setExecution] = useState<Execution | null>(null);

  async function ensureRuntime(): Promise<boolean> {
    if (runtime.status === 'pronto') return true;
    setRuntime({ status: 'carregando' });
    const t0 = performance.now();
    try {
      const nodes = await loadDotnet();
      setRuntime({ status: 'pronto', info: nodes.RuntimeInfo(), loadMs: Math.round(performance.now() - t0) });
      return true;
    } catch (e) {
      setRuntime({ status: 'erro', error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  async function executar(trigger: { nome: string }) {
    setRunning(true);
    setExecution(null);
    try {
      // Carrega o .NET antes: assim a duração do primeiro passo mede o nó, não o download do runtime.
      if (!(await ensureRuntime())) return;
      const result = await runFlow(demoFlow, trigger, {
        executors: { dotnet: dotnetExecutor, ts: createDemoExecutor() },
      });
      setExecution(result);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <h1>Relay</h1>
      <p className="muted">
        Fluxo: <code>saudacao</code> (C# em WebAssembly) → <code>grito</code> (TypeScript), e em paralelo{' '}
        <code>instavel</code>, que falha duas vezes antes de funcionar. Nenhum servidor envolvido.
      </p>

      <div className="row">
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
        <button onClick={() => executar({ nome })} disabled={running}>
          {running ? 'Executando…' : 'Executar fluxo'}
        </button>
        <button className="secondary" onClick={() => executar({ nome: '' })} disabled={running}>
          Executar com nome vazio
        </button>
      </div>

      <p className="muted">
        Runtime .NET: {runtime.status}
        {runtime.status === 'pronto' && ` · carregado em ${runtime.loadMs} ms · ${runtime.info}`}
      </p>
      {runtime.status === 'erro' && <pre>Falha ao carregar o runtime: {runtime.error}</pre>}

      {execution && (
        <section>
          <p className="muted">
            Execução: <span className={`status status-${execution.status}`}>{execution.status}</span> ·{' '}
            {execution.durationMs} ms
          </p>

          {execution.issues.length > 0 && (
            <pre>{execution.issues.map((i) => `${i.code}: ${i.message}`).join('\n')}</pre>
          )}

          <ol className="steps">
            {execution.steps.map((step) => (
              <Step key={step.nodeId} step={step} />
            ))}
          </ol>

          <details>
            <summary>JSON completo da execução</summary>
            <pre>{JSON.stringify(execution, null, 2)}</pre>
          </details>
        </section>
      )}
    </main>
  );
}

function Step({ step }: { step: StepLog }) {
  return (
    <li className="step">
      <div className="step-head">
        <span className={`status status-${step.status}`}>{step.status}</span>
        <strong>{step.nodeId}</strong>
        <span className="muted">
          {step.type} · {step.runtime}
        </span>
      </div>

      {step.skippedBecause && <p className="muted">pulado porque {step.skippedBecause}</p>}

      {step.attempts.length > 0 && (
        <ul className="attempts">
          {step.attempts.map((a) => (
            <li key={a.attempt}>
              tentativa {a.attempt} · {a.durationMs} ms ·{' '}
              {a.result.ok ? 'ok' : `${a.result.error.code}: ${a.result.error.message}`}
            </li>
          ))}
        </ul>
      )}

      {step.status === 'falhou' && step.attempts.length === 0 && step.error && (
        <p className="muted">
          {step.error.code}: {step.error.message}
        </p>
      )}

      {step.status === 'sucesso' && <pre>{JSON.stringify(step.output, null, 2)}</pre>}
    </li>
  );
}