import type { Execution, ExecutionStatus, FlowDefinition } from '@relay/engine';
import type { FlowLayout } from '@relay/db';

export interface FlowState {
  name: string;
  definition: FlowDefinition;
  layout: FlowLayout;
}

export interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  startedAt: number;
  durationMs: number;
}

export interface ExecutionRecord {
  execution: Execution;
  definition: FlowDefinition;
}

export interface RunResult {
  record: ExecutionRecord;
  note?: string;
}

export interface FlowBackend {
  readonly mode: 'navegador' | 'servidor';
  readonly label: string;
  load(): Promise<FlowState>;
  save(state: FlowState): Promise<void>;
  run(state: FlowState, trigger: Record<string, unknown>): Promise<RunResult>;
  listExecutions(): Promise<ExecutionSummary[]>;
  getExecution(id: string): Promise<ExecutionRecord | null>;
}

export function apiUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}