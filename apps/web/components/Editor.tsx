'use client';

import type { ExecutionSummary, Repository } from '@relay/db';
import { runFlow, validateFlow, type Execution, type StepStatus, type ValidationIssue } from '@relay/engine';
import {
  Background,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadDatabase } from '@/lib/db';
import { FLOW_ID, defaultFlow } from '@/lib/default-flow';
import { dotnetExecutor, loadDotnet } from '@/lib/dotnet';
import { nextNodeId, toCanvas, toDefinition, type RelayNode, type RelayNodeData } from '@/lib/flow-mapping';
import { NODE_CATALOG, createTsExecutor, getSpec } from '@/lib/node-catalog';
import { stableStringify } from '@/lib/stable-json';
import { CanvasOverlayContext } from './canvas-context';
import { ExecutionLog } from './ExecutionLog';
import { Inspector } from './Inspector';
import RelayNodeView from './RelayNodeView';

const nodeTypes = { relay: RelayNodeView };
const RUNTIMES = ['ts', 'dotnet'] as const;

type LoadState = { status: 'carregando' } | { status: 'pronto'; repo: Repository } | { status: 'erro'; message: string };
type SaveState =
  | { status: 'ocioso' }
  | { status: 'salvando' }
  | { status: 'salvo'; at: number }
  | { status: 'erro'; message: string };
type TriggerState = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };
type Shown = { execution: Execution; definitionKey: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR');

export function Editor() {
  const [load, setLoad] = useState<LoadState>({ status: 'carregando' });
  const [flowName, setFlowName] = useState(defaultFlow.definition.name);
  const [nodes, setNodes, onNodesChange] = useNodesState<RelayNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [triggerText, setTriggerText] = useState('{\n  "nome": "Arthur"\n}');
  const [save, setSave] = useState<SaveState>({ status: 'ocioso' });
  const [running, setRunning] = useState(false);
  const [runtimeNote, setRuntimeNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExecutionSummary[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const lastSaved = useRef<string | null>(null);

  const current = useMemo(() => toDefinition(FLOW_ID, flowName, nodes, edges), [flowName, nodes, edges]);
  const saveKey = useMemo(() => stableStringify(current), [current]);
  const definitionKey = useMemo(() => stableStringify(current.definition), [current]);

  // Abre o banco e carrega o fluxo (ou cria o de exemplo na primeira visita).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = await loadDatabase();
        let saved = await repo.getFlow(FLOW_ID);
        if (!saved) {
          await repo.saveFlow({ id: FLOW_ID, name: defaultFlow.definition.name, ...defaultFlow });
          saved = await repo.getFlow(FLOW_ID);
        }
        if (!saved) throw new Error('o fluxo de exemplo foi salvo, mas não voltou na leitura');
        const executions = await repo.listExecutions(FLOW_ID);
        if (cancelled) return;

        const canvas = toCanvas(saved.definition, saved.layout);
        lastSaved.current = stableStringify(toDefinition(FLOW_ID, saved.name, canvas.nodes, canvas.edges));
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setFlowName(saved.name);
        setHistory(executions);
        setLoad({ status: 'pronto', repo });
      } catch (e) {
        if (!cancelled) setLoad({ status: 'erro', message: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setNodes, setEdges]);

  // Autosave com debounce. Seleção e medição de nós mudam o array, mas não a chave, então não geram escrita.
  useEffect(() => {
    if (load.status !== 'pronto') return;
    if (saveKey === lastSaved.current) {
      setSave((s) => (s.status === 'salvando' ? { status: 'ocioso' } : s));
      return;
    }
    const { repo } = load;
    const { definition, layout } = current;
    setSave({ status: 'salvando' });
    const timer = setTimeout(() => {
      repo
        .saveFlow({ id: FLOW_ID, name: definition.name, definition, layout })
        .then(() => {
          lastSaved.current = saveKey;
          setSave({ status: 'salvo', at: Date.now() });
        })
        .catch((e: unknown) => setSave({ status: 'erro', message: errorMessage(e) }));
    }, 600);
    return () => clearTimeout(timer);
  }, [load, saveKey, current]);

  // Mesma validação do engine, somada ao que só a interface sabe: tipos fora do catálogo.
  const issues = useMemo<ValidationIssue[]>(() => {
    const unknownTypes = current.definition.nodes
      .filter((n) => !getSpec(n.type))
      .map((n) => ({ code: 'tipo_desconhecido', message: `o tipo '${n.type}' não está no catálogo`, nodeId: n.id }));
    return [...validateFlow(current.definition, RUNTIMES).issues, ...unknownTypes];
  }, [current.definition]);

  const overlay = useMemo(() => {
    const issuesById = new Map<string, string[]>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      issuesById.set(issue.nodeId, [...(issuesById.get(issue.nodeId) ?? []), `${issue.code}: ${issue.message}`]);
    }
    const statusById = new Map<string, StepStatus>((shown?.execution.steps ?? []).map((s) => [s.nodeId, s.status]));
    return { issuesById, statusById };
  }, [issues, shown]);

  const trigger = useMemo<TriggerState>(() => {
    try {
      const value: unknown = JSON.parse(triggerText);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, message: 'o gatilho precisa ser um objeto { ... }' };
      }
      return { ok: true, value: value as Record<string, unknown> };
    } catch (e) {
      return { ok: false, message: errorMessage(e) };
    }
  }, [triggerText]);

  const runBlocker =
    load.status !== 'pronto'
      ? 'aguardando o banco local'
      : draftError
        ? `configuração com JSON inválido em ${draftError}`
        : !trigger.ok
          ? 'corrija o gatilho antes de executar'
          : issues.length > 0
            ? 'corrija os problemas do fluxo antes de executar'
            : null;

  const selected = useMemo(() => {
    const list = nodes.filter((n) => n.selected);
    return list.length === 1 ? list[0] : null;
  }, [nodes]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);

  const updateNode = useCallback(
    (id: string, patch: Partial<RelayNodeData>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  function addNode(type: string) {
    const spec = getSpec(type);
    if (!spec) return;
    setNodes((ns) => {
      const offset = (ns.length % 6) * 30;
      const node: RelayNode = {
        id: nextNodeId(spec.idPrefix, ns.map((n) => n.id)),
        type: 'relay',
        position: { x: 60 + offset, y: 320 + offset },
        selected: true,
        data: {
          type: spec.type,
          runtime: spec.runtime,
          config: structuredClone(spec.defaultConfig),
          retry: spec.defaultRetry,
        },
      };
      return [...ns.map((n) => ({ ...n, selected: false })), node];
    });
  }

  async function execute() {
    if (load.status !== 'pronto' || !trigger.ok || runBlocker) return;
    const { repo } = load;
    const definition = current.definition;
    const triggerValue = trigger.value;
    setRunning(true);
    setRunError(null);
    try {
      // Lazy loading: o runtime .NET só é baixado se o fluxo tiver nó C#.
      if (definition.nodes.some((n) => n.runtime === 'dotnet')) {
        const t0 = performance.now();
        const dotnet = await loadDotnet();
        const ms = Math.round(performance.now() - t0);
        setRuntimeNote((note) => note ?? `runtime .NET carregado em ${ms} ms · ${dotnet.RuntimeInfo()}`);
      }

      const execution = await runFlow(definition, triggerValue, {
        executors: { ts: createTsExecutor(), dotnet: dotnetExecutor },
      });
      setShown({ execution, definitionKey: stableStringify(definition) });

      try {
        await repo.saveExecution({ id: crypto.randomUUID(), flowId: FLOW_ID, trigger: triggerValue, definition, execution });
        setHistory(await repo.listExecutions(FLOW_ID));
      } catch (e) {
        setRunError(`a execução rodou, mas não entrou no histórico: ${errorMessage(e)}`);
      }
    } catch (e) {
      setRunError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function openExecution(id: string) {
    if (load.status !== 'pronto') return;
    try {
      const saved = await load.repo.getExecution(id);
      if (!saved) {
        setRunError('essa execução não existe mais no banco');
        return;
      }
      setShown({ execution: saved.execution, definitionKey: stableStringify(saved.definition) });
    } catch (e) {
      setRunError(errorMessage(e));
    }
  }

  function restoreExample() {
    if (!window.confirm('Substituir o fluxo atual pelo exemplo? O histórico de execuções é mantido.')) return;
    const canvas = toCanvas(defaultFlow.definition, defaultFlow.layout);
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
    setFlowName(defaultFlow.definition.name);
    setShown(null);
  }

  return (
    <CanvasOverlayContext.Provider value={overlay}>
      <div className="app">
        <aside className="panel">
          <header>
            <h1>Relay</h1>
            <input
              className="flow-name"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              aria-label="Nome do fluxo"
            />
            <SaveBadge save={save} />
          </header>

          <section>
            <h2>Adicionar nó</h2>
            <div className="palette">
              {NODE_CATALOG.map((spec) => (
                <button
                  key={spec.type}
                  className="secondary palette-item"
                  title={spec.description}
                  onClick={() => addNode(spec.type)}
                  disabled={load.status !== 'pronto'}
                >
                  <span className={`runtime runtime-${spec.runtime}`}>{spec.runtime === 'dotnet' ? 'C#' : 'TS'}</span>
                  {spec.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Gatilho</h2>
            <textarea
              rows={4}
              spellCheck={false}
              value={triggerText}
              onChange={(e) => setTriggerText(e.target.value)}
              aria-label="Gatilho em JSON"
            />
            {!trigger.ok && <p className="error">{trigger.message}</p>}
            <button className="run-button" onClick={execute} disabled={running || !!runBlocker}>
              {running ? 'Executando…' : 'Executar fluxo'}
            </button>
            {runBlocker && !running && <p className="muted">{runBlocker}</p>}
            {runtimeNote && <p className="muted">{runtimeNote}</p>}
            {runError && <p className="error">{runError}</p>}
          </section>

          {issues.length > 0 && (
            <section>
              <h2>Problemas ({issues.length})</h2>
              <ul className="issues">
                {issues.map((issue, i) => (
                  <li key={i}>
                    {issue.nodeId && <code>{issue.nodeId}</code>} {issue.code}: {issue.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>Histórico</h2>
            {history.length === 0 ? (
              <p className="muted">nenhuma execução ainda</p>
            ) : (
              <ul className="history">
                {history.map((h) => (
                  <li key={h.id}>
                    <button className="history-item" onClick={() => openExecution(h.id)}>
                      <span className={`status status-${h.status}`}>{h.status}</span>
                      {hora(h.startedAt)} · {h.durationMs} ms
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <button className="secondary" onClick={restoreExample} disabled={load.status !== 'pronto'}>
              Restaurar exemplo
            </button>
          </section>
        </aside>

        <div className="canvas">
          {load.status === 'pronto' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              colorMode="dark"
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          ) : (
            <div className="canvas-message">
              {load.status === 'carregando' ? (
                <p className="muted">Abrindo o banco local (Postgres via PGlite)…</p>
              ) : (
                <p className="error">Não foi possível abrir o banco local: {load.message}</p>
              )}
            </div>
          )}
        </div>

        <aside className="panel">
          {selected ? (
            <Inspector
              key={selected.id}
              node={selected}
              issues={overlay.issuesById.get(selected.id) ?? []}
              onChange={updateNode}
              onDelete={deleteNode}
              onDraftError={setDraftError}
            />
          ) : (
            <p className="muted">
              Selecione um nó para editar. Arraste da bolinha direita de um nó até a esquerda de outro para
              conectar. Delete remove o que estiver selecionado.
            </p>
          )}
          {shown && (
            <ExecutionLog
              execution={shown.execution}
              stale={shown.definitionKey !== definitionKey}
              onClose={() => setShown(null)}
            />
          )}
        </aside>
      </div>
    </CanvasOverlayContext.Provider>
  );
}

function SaveBadge({ save }: { save: SaveState }) {
  switch (save.status) {
    case 'ocioso':
      return <p className="muted">sem alterações pendentes</p>;
    case 'salvando':
      return <p className="muted">salvando…</p>;
    case 'salvo':
      return <p className="muted">salvo no navegador às {hora(save.at)}</p>;
    case 'erro':
      return <p className="error">não salvou: {save.message}</p>;
  }
}
