import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_HOST_URL: z.string().url(),
  NODE_HOST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  LLM_MODEL: z.string().trim().min(1).optional(),
});

export type Env = z.output<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ');
    throw new Error(`variáveis de ambiente inválidas (${campos}). Copie .env.example para .env na raiz.`);
  }
  return parsed.data;
}