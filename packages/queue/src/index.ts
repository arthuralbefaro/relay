export const QUEUE_NAME = 'executions';

export interface ExecutionJobData {
    flowId: string;
    trigger: Record<string, unknown>;
}

export interface RedisConnection {
    host: string;
    port: number;
    db: number;
    username?: string;
    password?: string;
    tls?: Record<string, never>;
}

export function redisConnection(url: string): RedisConnection {
    const parsed = new URL(url);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
        throw new Error('REDIS_URL deve começar com redis:// ou rediss://');
    }

    const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
    if (!Number.isInteger(db) || db < 0) {
        throw new Error('o número do banco em REDIS_URL é inválido');
    }

    return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 6379,
        db,
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    };
}