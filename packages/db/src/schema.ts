import type { Execution, FlowDefinition, StepLog, ValidationIssue } from '@relay/engine';
import { bigint, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

export type FlowLayout = Record<string, { x: number; y: number }>;

// Tipagem das queries. O DDL vive em migrations.ts, e o teste do repositório prova que os dois batem:
// se uma coluna divergir, as queries do Drizzle falham contra o banco migrado.
export const flows = pgTable('flows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  definition: jsonb('definition').$type<FlowDefinition>().notNull(),
  layout: jsonb('layout').$type<FlowLayout>().notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const executions = pgTable('executions', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull(),
  status: text('status').$type<Execution['status']>().notNull(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  trigger: jsonb('trigger').$type<unknown>().notNull(),
  definition: jsonb('definition').$type<FlowDefinition>().notNull(),
  steps: jsonb('steps').$type<StepLog[]>().notNull(),
  issues: jsonb('issues').$type<ValidationIssue[]>().notNull(),
});