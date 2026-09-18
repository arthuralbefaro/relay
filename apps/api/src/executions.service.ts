import { randomUUID } from 'node:crypto';
import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Repository } from '@relay/db';
import type { ExecutionJobData } from '@relay/queue';
import type { Queue } from 'bullmq';
import { EXECUTION_QUEUE, REPOSITORY } from './tokens';

@Injectable()
export class ExecutionsService {
  constructor(
    @Inject(REPOSITORY) private readonly repo: Repository,
    @Inject(EXECUTION_QUEUE) private readonly queue: Queue<ExecutionJobData>,
  ) {}

  async enqueue(flowId: string, trigger: Record<string, unknown>) {
    if (!(await this.repo.getFlow(flowId))) {
      throw new NotFoundException({ code: 'fluxo_inexistente', message: `o fluxo '${flowId}' não existe` });
    }
    const executionId = randomUUID();
    await this.queue.add('executar', { flowId, trigger }, { jobId: executionId });
    return { executionId, state: 'enfileirada' as const };
  }

  async get(executionId: string) {
    const saved = await this.repo.getExecution(executionId);
    if (saved) return { state: 'concluida' as const, execution: saved };

    const job = await this.queue.getJob(executionId);
    if (!job) {
      throw new NotFoundException({ code: 'execucao_inexistente', message: `a execução '${executionId}' não existe` });
    }

    const state = await job.getState();

    if (state === 'completed') {
      const late = await this.repo.getExecution(executionId);
      if (late) return { state: 'concluida' as const, execution: late };
      throw new InternalServerErrorException({
        code: 'execucao_perdida',
        message: 'o job terminou, mas a execução não foi gravada no banco',
      });
    }
    if (state === 'failed') return { state: 'falhou_na_infra' as const, reason: job.failedReason };
    if (state === 'active') return { state: 'executando' as const };
    return { state: 'enfileirada' as const, queueState: state };
  }
}