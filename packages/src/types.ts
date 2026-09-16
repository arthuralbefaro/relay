export type NodeRuntime = 'ts' | 'dotnet';

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface FlowNode {
  id: string;
  type: string;
  runtime: NodeRuntime;
  config?: Record<string, unknown>;
  retry?: RetryPolicy;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface NodeError {
  code: string;
  message: string;
}

export type NodeResult = { ok: true; output: unknown } | { ok: false; error: NodeError };

export interface NodeExecutor {
  execute(nodeType: string, input: unknown): Promise<NodeResult>;
}

export interface EngineDeps {
  executors: Partial<Record<NodeRuntime, NodeExecutor>>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AttemptLog {
  attempt: number;
  startedAt: number;
  durationMs: number;
  result: NodeResult;
}

export type StepStatus = 'sucesso' | 'falhou' | 'pulado';

export interface StepLog {
  nodeId: string;
  type: string;
  runtime: NodeRuntime;
  status: StepStatus;
  attempts: AttemptLog[];
  input?: unknown;
  output?: unknown;
  error?: NodeError;
  skippedBecause?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export type ExecutionStatus = 'sucesso' | 'falhou' | 'invalida';

export interface Execution {
  flowId: string;
  status: ExecutionStatus;
  startedAt: number;
  durationMs: number;
  steps: StepLog[];
  issues: ValidationIssue[];
}