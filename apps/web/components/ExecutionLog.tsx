'use client';

import type { Execution, StepLog } from '@relay/engine';

type Props = {
  execution: Execution;
  stale: boolean;
  onClose: () => void;
};

export function ExecutionLog({ execution, stale, onClose }: Props) {
  return (
    <section className="log">
      <div className="log-head">
        <h2>Execução</h2>
        <button className="link" onClick={onClose}>
          fechar
        </button>
      </div>
      <p className="muted">
        <span className={`status status-${execution.status}`}>{execution.status}</span> ·{' '}
        {new Date(execution.startedAt).toLocaleTimeString('pt-BR')} · {execution.durationMs} ms
      </p>
      {stale && (
        <p className="warn">
          O fluxo mudou desde esta execução. As cores no canvas usam os ids atuais e podem não corresponder.
        </p>
      )}
      {execution.issues.length > 0 && (
        <pre>{execution.issues.map((i) => `${i.code}: ${i.message}`).join('\n')}</pre>
      )}
      <ol className="steps">
        {execution.steps.map((step) => (
          <Step key={step.nodeId} step={step} />
        ))}
      </ol>
      <details>
        <summary>JSON completo</summary>
        <pre>{JSON.stringify(execution, null, 2)}</pre>
      </details>
    </section>
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