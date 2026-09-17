'use client';

import type { RetryPolicy } from '@relay/engine';
import { useEffect, useState } from 'react';
import type { RelayNode, RelayNodeData } from '@/lib/flow-mapping';
import { getSpec } from '@/lib/node-catalog';

type Props = {
  node: RelayNode;
  issues: readonly string[];
  onChange: (id: string, patch: Partial<RelayNodeData>) => void;
  onDelete: (id: string) => void;
  onDraftError: (message: string | null) => void;
};

const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, backoffMs: 300 };
const numberValue = (n: number) => (Number.isFinite(n) ? n : '');

export function Inspector({ node, issues, onChange, onDelete, onDraftError }: Props) {
  const spec = getSpec(node.data.type);
  const [configText, setConfigText] = useState(() => JSON.stringify(node.data.config, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);

  // O rascunho morre junto com o painel, então o erro dele não pode continuar bloqueando a execução.
  useEffect(() => () => onDraftError(null), [onDraftError]);

  function editConfig(text: string) {
    setConfigText(text);
    let message: string | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        message = 'a configuração precisa ser um objeto { ... }';
      } else {
        onChange(node.id, { config: parsed as Record<string, unknown> });
      }
    } catch (e) {
      message = e instanceof Error ? e.message : 'JSON inválido';
    }
    setConfigError(message);
    onDraftError(message && `'${node.id}': ${message}`);
  }

  const retry = node.data.retry;
  const setRetry = (next: RetryPolicy | undefined) => onChange(node.id, { retry: next });

  return (
    <section className="inspector">
      <div className="log-head">
        <h2>{spec?.label ?? node.data.type}</h2>
        <span className={`runtime runtime-${node.data.runtime}`}>{node.data.runtime === 'dotnet' ? 'C#' : 'TS'}</span>
      </div>
      <p className="muted">
        id <code>{node.id}</code> · tipo <code>{node.data.type}</code>
      </p>
      {spec && <p className="muted">{spec.description}</p>}

      <label className="field">
        <span>Configuração (JSON)</span>
        <textarea rows={8} spellCheck={false} value={configText} onChange={(e) => editConfig(e.target.value)} />
      </label>
      {configError ? (
        <p className="error">{configError} · o canvas mantém a última versão válida</p>
      ) : (
        <p className="muted">
          Use <code>=trigger.campo</code> ou <code>=steps.id.campo</code> para ler dados.
        </p>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={!!retry}
          onChange={(e) => setRetry(e.target.checked ? (spec?.defaultRetry ?? DEFAULT_RETRY) : undefined)}
        />
        Repetir em falha transitória
      </label>
      {retry && (
        <div className="row">
          <label className="field">
            <span>Tentativas</span>
            <input
              type="number"
              min={1}
              max={10}
              value={numberValue(retry.maxAttempts)}
              onChange={(e) => setRetry({ ...retry, maxAttempts: e.target.valueAsNumber })}
            />
          </label>
          <label className="field">
            <span>Backoff (ms)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={numberValue(retry.backoffMs)}
              onChange={(e) => setRetry({ ...retry, backoffMs: e.target.valueAsNumber })}
            />
          </label>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}

      <button className="danger" onClick={() => onDelete(node.id)}>
        Remover nó
      </button>
    </section>
  );
}
