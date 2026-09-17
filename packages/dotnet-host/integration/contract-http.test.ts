import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NodeExecutor } from '@relay/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { createHttpDotnetExecutor } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = join(root, '.env');
if (!process.env.NODE_HOST_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const baseUrl = process.env.NODE_HOST_URL;
const fixturesDir = join(root, 'fixtures', 'nodes');

type Caso = { arquivo: string; nome: string; node: string; input: unknown; expected: unknown };

const casos: Caso[] = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((arquivo) =>
    (JSON.parse(readFileSync(join(fixturesDir, arquivo), 'utf8')) as Omit<Caso, 'arquivo'>[]).map((c) => ({ arquivo, ...c })),
  );

describe('contrato C# ↔ TypeScript (node-host via HTTP)', () => {
  let executor: NodeExecutor;

  beforeAll(async () => {
    if (!baseUrl) throw new Error('NODE_HOST_URL não definida. Copie .env.example para .env e rode "pnpm infra".');

    const health = await fetch(`${baseUrl}/health`).catch((e: unknown) => {
      throw new Error(`node-host não respondeu em ${baseUrl}/health (${e instanceof Error ? e.name : 'erro'}). Rode "pnpm infra".`);
    });
    if (!health.ok) throw new Error(`node-host respondeu HTTP ${health.status} em /health`);

    executor = createHttpDotnetExecutor({ baseUrl, timeoutMs: 5000 });
  }, 30_000);

  it('existe pelo menos uma fixture', () => {
    expect(casos.length).toBeGreaterThan(0);
  });

  it.each(casos)('$arquivo · $nome', async (caso) => {
    expect(await executor.execute(caso.node, caso.input)).toEqual(caso.expected);
  });

  it('resposta fora de 2xx vira exceção, não resultado', async () => {
    const wrong = createHttpDotnetExecutor({ baseUrl: `${baseUrl}/rota-que-nao-existe`, timeoutMs: 5000 });
    await expect(wrong.execute('hello', { name: 'x' })).rejects.toThrow('HTTP 404');
  });

  it('corpo que não é JSON vira json_invalido do lado C#', async () => {
    const response = await fetch(`${baseUrl}/nodes/hello/execute`, { method: 'POST', body: '{quebrado' });
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'json_invalido', message: 'a entrada não é um JSON válido' },
    });
  });
});