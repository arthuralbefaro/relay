import { collectReferences } from './resolve';
import type { FlowDefinition, NodeRuntime, ValidationIssue } from './types';

export interface ValidationResult {
  issues: ValidationIssue[];
  order: string[];
  parents: Map<string, string[]>;
}

const RUNTIMES: readonly string[] = ['ts', 'dotnet'];

export function validateFlow(flow: FlowDefinition, availableRuntimes: readonly NodeRuntime[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const parents = new Map<string, string[]>();
  const ids = new Set<string>();

  if (flow.nodes.length === 0) issues.push({ code: 'fluxo_vazio', message: 'o fluxo não tem nós' });

  for (const node of flow.nodes) {
    if (ids.has(node.id)) {
      issues.push({ code: 'id_duplicado', message: `o id '${node.id}' aparece mais de uma vez`, nodeId: node.id });
    }
    ids.add(node.id);
    parents.set(node.id, []);

    if (!RUNTIMES.includes(node.runtime)) {
      issues.push({ code: 'runtime_desconhecido', message: `runtime '${node.runtime}' não existe`, nodeId: node.id });
    } else if (!availableRuntimes.includes(node.runtime)) {
      issues.push({
        code: 'runtime_sem_executor',
        message: `nenhum executor registrado para o runtime '${node.runtime}'`,
        nodeId: node.id,
      });
    }

    if (node.retry) {
      const { maxAttempts, backoffMs } = node.retry;
      const valid =
        Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 10 &&
        Number.isFinite(backoffMs) && backoffMs >= 0;
      if (!valid) {
        issues.push({
          code: 'retry_invalido',
          message: 'retry exige maxAttempts inteiro de 1 a 10 e backoffMs >= 0',
          nodeId: node.id,
        });
      }
    }
  }

  for (const edge of flow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      issues.push({ code: 'aresta_invalida', message: `a aresta ${edge.from} → ${edge.to} aponta para nó inexistente` });
      continue;
    }
    const list = parents.get(edge.to)!;
    if (!list.includes(edge.from)) list.push(edge.from);
  }

  if (issues.some((i) => i.code === 'id_duplicado' || i.code === 'aresta_invalida')) {
    return { issues, order: [], parents };
  }

  const pending = new Map(flow.nodes.map((n) => [n.id, parents.get(n.id)!.length]));
  const order: string[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const node of flow.nodes) {
      if (pending.get(node.id) !== 0) continue;
      pending.delete(node.id);
      order.push(node.id);
      for (const [id, count] of pending) {
        if (parents.get(id)!.includes(node.id)) pending.set(id, count - 1);
      }
      progressed = true;
      break;
    }
  }

  if (pending.size > 0) {
    issues.push({ code: 'ciclo', message: `ciclo envolvendo: ${[...pending.keys()].join(', ')}` });
    return { issues, order: [], parents };
  }

  const ancestors = new Map<string, Set<string>>();
  for (const id of order) {
    const set = new Set<string>();
    for (const parent of parents.get(id)!) {
      set.add(parent);
      for (const a of ancestors.get(parent)!) set.add(a);
    }
    ancestors.set(id, set);
  }

  for (const node of flow.nodes) {
    for (const [head, stepId] of collectReferences(node.config)) {
      if (head === 'trigger') continue;
      if (head !== 'steps') {
        issues.push({ code: 'referencia_invalida', message: `raiz '${head}' desconhecida; use trigger ou steps`, nodeId: node.id });
      } else if (!stepId || !ids.has(stepId)) {
        issues.push({ code: 'referencia_invalida', message: `steps.${stepId ?? ''} não é um nó do fluxo`, nodeId: node.id });
      } else if (!ancestors.get(node.id)!.has(stepId)) {
        issues.push({
          code: 'referencia_nao_ancestral',
          message: `'${node.id}' lê steps.${stepId}, mas '${stepId}' não é ancestral dele`,
          nodeId: node.id,
        });
      }
    }
  }

  return { issues, order, parents };
}