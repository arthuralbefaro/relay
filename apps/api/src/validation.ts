import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const FLOW_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EXECUTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const node = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  runtime: z.enum(['ts', 'dotnet']),
  config: z.record(z.string(), z.unknown()).optional(),
  retry: z.object({ maxAttempts: z.number(), backoffMs: z.number() }).optional(),
});

export const flowBody = z.object({
  name: z.string().trim().min(1).max(200),
  definition: z.object({
    nodes: z.array(node).max(200),
    edges: z.array(z.object({ from: z.string(), to: z.string() })).max(1000),
  }),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
});

export const triggerBody = z.record(z.string(), z.unknown());

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new BadRequestException({
            code: 'corpo_invalido',
            issues: result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message})),
        });
    }
    return result.data;
}

export function flowId(value: string): string {
    if (!FLOW_ID.test(value)) {
        throw new BadRequestException({
        code: 'id_invalido',
        message: 'o id do fluxo deve ter de 1 a 64 caracteres entre a-z, 0-9, _ e -',
        });
    }
    return value;
}

export function executionId(value: string): string {
    if (!EXECUTION_ID.test(value)) {
        throw new BadRequestException({ code: 'id_invalido', message: 'o id da execução deve ser um UUID' });
    }
    return value;
}

export function limit(value: string | undefined): number {
    const n = value === undefined ? 20 : Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new BadRequestException({ code: 'limite_invalido', message: 'limit deve ser um inteiro de 1 a 100'});
    return n;
}