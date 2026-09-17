import type { Execution, FlowDefinition } from '@relay/engine';
import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { executions, flows, type FlowLayout } from './schema';

export type QueryMethod = 'all' | 'execute';
export type QueryFn = (sql: string, params: unknown[], method: QueryMethod) => Promise<{ rows: unknown[] }>;

export interface PGliteLike {
  query(sql: string, params?: unknown[], options?: { rowMode?: 'array' | 'object' }): Promise<{ rows: unknown[] }>;
}

// O Drizzle pede linhas como arrays em 'all' (mapeia colunas por posição) e objetos em 'execute'.
export function pgliteQuery(client: PGliteLike): QueryFn {
  return async (sql, params, method) => {
    const result = await client.query(sql, params, { rowMode: method === 'all' ? 'array' : 'object' });
    return { rows: result.rows };
  };
}

export interface FlowInput {
  id: string;
  name: string;
  definition: FlowDefinition;
  layout: FlowLayout;
}

export interface SavedFlow extends FlowInput {
  updatedAt: number;
}

export interface FlowSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface ExecutionInput {
  id: string;
  flowId: string;
  trigger: unknown;
  definition: FlowDefinition;
  execution: Execution;
}

export interface ExecutionSummary {
  id: string;
  status: Execution['status'];
  startedAt: number;
  durationMs: number;
}

export interface SavedExecution extends ExecutionSummary {
  flowId: string;
  trigger: unknown;
  definition: FlowDefinition;
  execution: Execution;
}

export function createRepository(query: QueryFn, now: () => number = () => Date.now()) {
  const db = drizzle(query);

  return {
    async listFlows(): Promise<FlowSummary[]> {
      return await db
        .select({ id: flows.id, name: flows.name, updatedAt: flows.updatedAt })
        .from(flows)
        .orderBy(desc(flows.updatedAt));
    },

    async getFlow(id: string): Promise<SavedFlow | null> {
      const [row] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
      return row ?? null;
    },

    async saveFlow(flow: FlowInput): Promise<void> {
      const updatedAt = now();
      await db
        .insert(flows)
        .values({ ...flow, updatedAt })
        .onConflictDoUpdate({
          target: flows.id,
          set: { name: flow.name, definition: flow.definition, layout: flow.layout, updatedAt },
        });
    },

    async deleteFlow(id: string): Promise<void> {
      await db.delete(flows).where(eq(flows.id, id));
    },

    async saveExecution({ id, flowId, trigger, definition, execution }: ExecutionInput): Promise<void> {
      await db.insert(executions).values({
        id,
        flowId,
        status: execution.status,
        startedAt: execution.startedAt,
        durationMs: execution.durationMs,
        trigger,
        definition,
        steps: execution.steps,
        issues: execution.issues,
      })
      .onConflictDoNothing({ target: executions.id });
    },

    async listExecutions(flowId: string, limit = 20): Promise<ExecutionSummary[]> {
      return await db
        .select({
          id: executions.id,
          status: executions.status,
          startedAt: executions.startedAt,
          durationMs: executions.durationMs,
        })
        .from(executions)
        .where(eq(executions.flowId, flowId))
        .orderBy(desc(executions.startedAt))
        .limit(limit);
    },

    async getExecution(id: string): Promise<SavedExecution | null> {
      const [row] = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        flowId: row.flowId,
        status: row.status,
        startedAt: row.startedAt,
        durationMs: row.durationMs,
        trigger: row.trigger,
        definition: row.definition,
        execution: {
          flowId: row.flowId,
          status: row.status,
          startedAt: row.startedAt,
          durationMs: row.durationMs,
          steps: row.steps,
          issues: row.issues,
        },
      };
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;