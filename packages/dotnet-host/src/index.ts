import type { NodeExecutor, NodeResult } from '@relay/engine';

export type DotnetExports = {
  Execute(nodeType: string, inputJson: string): string;
  RuntimeInfo(): string;
};

export type ModuleImporter = (url: string) => Promise<unknown>;

type DotnetModule = {
  dotnet: {
    create(): Promise<{
      getAssemblyExports(assemblyName: string): Promise<unknown>;
      getConfig(): { mainAssemblyName?: string };
    }>;
  };
};

type AssemblyExports = { Relay?: { Nodes?: { Wasm?: { NodeExports?: DotnetExports } } } };

export async function loadDotnetModule(url: string, importModule: ModuleImporter): Promise<DotnetExports> {
  const { dotnet } = (await importModule(url)) as DotnetModule;
  const runtime = await dotnet.create();

  const assembly = runtime.getConfig().mainAssemblyName;
  if (!assembly) throw new Error('dotnet.js carregou, mas a configuração não tem mainAssemblyName');

  const exports = (await runtime.getAssemblyExports(assembly)) as AssemblyExports;
  const nodes = exports.Relay?.Nodes?.Wasm?.NodeExports;
  if (!nodes) throw new Error(`o assembly '${assembly}' não exporta Relay.Nodes.Wasm.NodeExports`);

  return nodes;
}

export function createDotnetExecutor(load: () => Promise<DotnetExports>): NodeExecutor {
  return {
    async execute(nodeType, input) {
      const nodes = await load();
      const raw = nodes.Execute(nodeType, JSON.stringify(input ?? null));
      try {
        return JSON.parse(raw) as NodeResult;
      } catch {
        return { ok: false, error: { code: 'resultado_malformado', message: 'o runtime .NET devolveu texto que não é JSON' } };
      }
    },
  };
}

export { createHttpDotnetExecutor, type HttpExecutorOptions } from './http';