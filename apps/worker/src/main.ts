import { createRepository, pendingMigrations } from '@relay/db';
import { pgMigrationClient, pgQuery } from '@relay/db/pg';
import { createHttpDotnetExecutor } from '@relay/dotnet-host';
import { runFlow } from '@relay/engine';
import { createTsExecutor } from '@relay/nodes';
import { QUEUE_NAME, redisConnection, type ExecutionJobData } from '@relay/queue';
import { UnrecoverableError, Worker } from 'bullmq';
import pg from 'pg';
import { loadEnv } from './env';

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.WORKER_CONCURRENCY + 2 });

const pending = await pendingMigrations(pgMigrationClient(pool));
if (pending.length > 0) {
  console.error(`o banco tem migrations pendentes (${pending.join(', ')}). Rode "pnpm migrate".`);
  await pool.end();
  process.exit(1);
}

const repo = createRepository(pgQuery(pool));
const dotnet = createHttpDotnetExecutor({ baseUrl: env.NODE_HOST_URL, timeoutMs: env.NODE_HOST_TIMEOUT_MS });

const worker = new Worker<ExecutionJobData, { status: string }>(
  QUEUE_NAME,
  async (job) => {
    if (!job.id) throw new UnrecoverableError('job sem id');

    const flow = await repo.getFlow(job.data.flowId);
    if (!flow) throw new UnrecoverableError(`o fluxo '${job.data.flowId}' não existe mais`);

    const execution = await runFlow(flow.definition, job.data.trigger, {
      executors: { ts: createTsExecutor(), dotnet },
    });

    await repo.saveExecution({
      id: job.id,
      flowId: flow.id,
      trigger: job.data.trigger,
      definition: flow.definition,
      execution,
    });

    return { status: execution.status };
  },
  {
    connection: { ...redisConnection(env.REDIS_URL), maxRetriesPerRequest: null },
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on('ready', () => console.log(`worker pronto · concorrência ${env.WORKER_CONCURRENCY}`));

worker.on('completed', (job, result) => {
    console.log(`execução ${job.id} · ${result.status} · ${Date.now() - job.timestamp} ms desde o enfileiramento`);
});

worker.on('failed', (job, err) => {
    console.error(`execução ${job?.id ?? '?'} falhou na infraestrutura (tentativa ${job?.attemptsMade ?? '?'}): ${err.name}: ${err.message}`);
});

worker.on('error', (err) => console.error(`erro no worker: ${err.name}`));

let closing = false;

async function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    console.log(`${signal} recebido, terminando os jobs em andamento`);
    await worker.close();
    await pool.end();
    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));