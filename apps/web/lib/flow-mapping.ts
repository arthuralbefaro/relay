import type { FlowLayout } from '@relay/db';
import type { FlowDefinition, FlowNode, RetryPolicy } from '@relay/engine';
import type { Edge, Node } from '@xyflow/react';

export type RelayNodeData = {
  type: string;
  runtime: FlowNode['runtime'];
  config: Record<string, unknown>;
  retry?: RetryPolicy;
};

export type RelayNode = Node<RelayNodeData, 'relay'>;

export function toCanvas(definition: FlowDefinition, layout: FlowLayout): { nodes: RelayNode[]; edges: Edge[] } {
  return {
    nodes: definition.nodes.map((node, i) => ({
      id: node.id,
      type: 'relay',
      position: layout[node.id] ?? { x: i * 260, y: 0 },
      data: { type: node.type, runtime: node.runtime, config: node.config ?? {}, retry: node.retry },
    })),
    edges: definition.edges.map((edge) => ({ id: `${edge.from}->${edge.to}`, source: edge.from, target: edge.to })),
  };
}

export function toDefinition(
  id: string,
  name: string,
  nodes: RelayNode[],
  edges: Edge[],
): { definition: FlowDefinition; layout: FlowLayout } {
  return {
    definition: {
      id,
      name,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type,
        runtime: n.data.runtime,
        config: n.data.config,
        ...(n.data.retry ? { retry: n.data.retry } : {}),
      })),
      edges: edges.map((e) => ({ from: e.source, to: e.target })),
    },
    layout: Object.fromEntries(
      nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]),
    ),
  };
}

export function nextNodeId(prefix: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(prefix)) return prefix;
  for (let i = 2; ; i++) {
    if (!taken.has(`${prefix}_${i}`)) return `${prefix}_${i}`;
  }
}