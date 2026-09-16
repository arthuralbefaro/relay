import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { NodeExecutor } from '@relay/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDotnetExecutor, loadDotnetModule } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dotnetJs = join(root, 'dist', 'wasm', 'wwwroot', '_framework', 'dotnet.js');
const fixturesDir = join(root, 'fixtures', 'nodes');

type Caso = { arquivo: string; nome: string; node: string; input: unknown; expected: unknown };

const casos: Caso[] = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((arquivo) =>
    (JSON.parse(readFileSync(join(fixturesDir, arquivo), 'utf8')) as Omit<Caso, 'arquivo'>[]).map((c) => ({ arquivo, ...c })),
  );

// As mesmas fixtures do xUnit, agora contra o WASM publicado.
// Se C# e TS divergirem sobre o formato, este arquivo quebra.
describe('contrato C# ↔ TypeScript (WASM real)', () => {
  let executor: NodeExecutor;

  beforeAll(async () => {
    if (!existsSync(dotnetJs)) {
      // Falha em vez de pular: teste pulado tem a mesma cara de teste aprovado.
      throw new Error(`WASM não encontrado em ${dotnetJs}. Rode "pnpm dotnet" antes dos testes.`);
    }
    const nodes = await loadDotnetModule(pathToFileURL(dotnetJs).href, (url) => import(/* @vite-ignore */ url));
    executor = createDotnetExecutor(async () => nodes);
  }, 60_000);

  it('existe pelo menos uma fixture', () => {
    expect(casos.length).toBeGreaterThan(0);
  });

  it.each(casos)('$arquivo · $nome', async (caso) => {
    expect(await executor.execute(caso.node, caso.input)).toEqual(caso.expected);
  });
});
