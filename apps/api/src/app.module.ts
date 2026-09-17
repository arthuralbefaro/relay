import { Inject, Injectable, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { createRepository, pendingMigrations } from '@relay/db';
import { pgMigrationClient, pgQuery } from '@relay/db/pg';
import { QUEUE_NAME, redisConnection, type ExecutionJobData } from '@relay/queue';
import { Queue } from 'bullmq';
import pg from 'pg';
import type { Pool } from 'pg';
import { ExecutionsController, FlowsController, HealthController, HooksController } from './controllers';
import type { Env } from './env';
import { ExecutionsService } from './executions.service';
import { EXECUTION_QUEUE, POOL, REPOSITORY } from './tokens';

@Injectable()
class Shutdown implements OnApplicationShutdown {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EXECUTION_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.queue.close(), this.pool.end()]);
  }
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      controllers: [FlowsController, HooksController, ExecutionsController, HealthController],
      providers: [
        {
          provide: POOL,
          useFactory: () => new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 }),
        },
        {
          provide: REPOSITORY,
          inject: [POOL],
          useFactory: async (pool: Pool) => {
            const pending = await pendingMigrations(pgMigrationClient(pool));
            if (pending.length > 0) {
              throw new Error(`o banco tem migrations pendentes (${pending.join(', ')}). Rode "pnpm migrate".`);
            }
            return createRepository(pgQuery(pool));
          },
        },
        {
          provide: EXECUTION_QUEUE,
          useFactory: () =>
            new Queue<ExecutionJobData>(QUEUE_NAME, {
              connection: { ...redisConnection(env.REDIS_URL), enableOfflineQueue: false },
              defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { age: 3600, count: 1000 },
                removeOnFail: { age: 86_400 },
              },
            }),
        },
        ExecutionsService,
        Shutdown,
      ],
    };
  }
}