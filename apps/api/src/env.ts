import { z } from "zod";

const schema = z.object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    API_PORT: z.coerce.number().int().positive().default(3001),
    API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
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