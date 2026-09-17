'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { RelayNode } from '@/lib/flow-mapping';
import { getSpec } from '@/lib/node-catalog';
import { useCanvasOverlay } from './canvas-context';

function RelayNodeView({ id, data, selected }: NodeProps<RelayNode>) {
  const { statusById, issuesById } = useCanvasOverlay();
  const spec = getSpec(data.type);
  const status = statusById.get(id);
  const issues = issuesById.get(id) ?? [];

  const className = ['relay-node', selected && 'is-selected', issues.length > 0 && 'has-issues']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <Handle type="target" position={Position.Left} />
      <div className="relay-node-head">
        <span className={`runtime runtime-${data.runtime}`}>{data.runtime === 'dotnet' ? 'C#' : 'TS'}</span>
        <strong>{spec?.label ?? data.type}</strong>
      </div>
      <div className="relay-node-id">{id}</div>
      {data.retry && <div className="muted">retry ×{data.retry.maxAttempts}</div>}
      {status && <span className={`status status-${status}`}>{status}</span>}
      {issues.length > 0 && (
        <div className="relay-node-warn" title={issues.join('\n')}>
          {issues.length} problema(s)
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(RelayNodeView);