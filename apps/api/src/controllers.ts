import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Repository } from '@relay/db';
import { validateFlow } from '@relay/engine';
import { getSpec } from '@relay/nodes';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { ExecutionsService } from './executions.service';
import { EXECUTION_QUEUE, POOL, REPOSITORY } from './tokens';
import { executionId, flowBody, flowId, limit, parse, triggerBody } from './validation';

@Controller('flows')
export class FlowsController {
  constructor(
    @Inject(REPOSITORY) private readonly repo: Repository,
    @Inject(ExecutionsService) private readonly executions: ExecutionsService,
  ) {}

  @Get()
  list() {
    return this.repo.listFlows();
  }

  @Get(':id')
  async get(@Param('id') rawId: string) {
    const id = flowId(rawId);
    const flow = await this.repo.getFlow(id);
    if (!flow) throw new NotFoundException({ code: 'fluxo_inexistente', message: `o fluxo '${id}' não existe` });
    return flow;
  }

  @Put(':id')
  async save(@Param('id') rawId: string, @Body() body: unknown) {
    const id = flowId(rawId);
    const input = parse(flowBody, body);
    const definition = { id, name: input.name, ...input.definition };

    await this.repo.saveFlow({ id, name: input.name, definition, layout: input.layout });

    const unknownTypes = definition.nodes
      .filter((n) => !getSpec(n.type))
      .map((n) => ({ code: 'tipo_desconhecido', message: `o tipo '${n.type}' não está no catálogo`, nodeId: n.id }));

    return { id, issues: [...validateFlow(definition, ['ts', 'dotnet']).issues, ...unknownTypes] };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') rawId: string) {
    await this.repo.deleteFlow(flowId(rawId));
  }

  @Get(':id/executions')
  listExecutions(@Param('id') rawId: string, @Query('limit') rawLimit?: string) {
    return this.repo.listExecutions(flowId(rawId), limit(rawLimit));
  }

  @Post(':id/executions')
  @HttpCode(202)
  run(@Param('id') rawId: string, @Body() body: unknown) {
    return this.executions.enqueue(flowId(rawId), parse(triggerBody, body ?? {}));
  }
}

@Controller('hooks')
export class HooksController {
  constructor(@Inject(ExecutionsService) private readonly executions: ExecutionsService) {}

  @Post(':flowId')
  @HttpCode(202)
  receive(@Param('flowId') rawId: string, @Body() body: unknown) {
    return this.executions.enqueue(flowId(rawId), parse(triggerBody, body ?? {}));
  }
}

@Controller('executions')
export class ExecutionsController {
  constructor(@Inject(ExecutionsService) private readonly executions: ExecutionsService) {}

  @Get(':id')
  async get(@Param('id') rawId: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.executions.get(executionId(rawId));
    if (result.state === 'enfileirada' || result.state === 'executando') res.status(202);
    return result;
  }
}

function probe(task: () => Promise<unknown>): Promise<string> {
  return Promise.race([
    task().then(() => 'ok'),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve('timeout'), 2000).unref();
    }),
  ]).catch((e: unknown) => (e instanceof Error ? e.name : 'erro'));
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(EXECUTION_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      probe(() => this.pool.query('select 1')),
      probe(() => this.queue.getJobCounts()),
    ]);
    if (db !== 'ok' || redis !== 'ok') throw new ServiceUnavailableException({ db, redis });
    return { db, redis };
  }
}