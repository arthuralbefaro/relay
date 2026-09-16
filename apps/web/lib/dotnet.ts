export type NodeResult =
  | { ok: true; output: unknown }
  | { ok: false; error: { code: string; message: string } };

type NodeExports = {
  Execute(nodeType: string, inputJson: string): string;
  RuntimeInfo(): string;
};

// import() via Function para o bundler não tentar empacotar o dotnet.js,
// que é servido como arquivo estático em /dotnet/_framework.
const importModule = new Function('url', 'return import(url)') as (url: string) => Promise<any>;

let loading: Promise<NodeExports> | null = null;

export function loadDotnet(): Promise<NodeExports> {
  if (!loading) {
    loading = (async () => {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const url = new URL(`${base}/dotnet/_framework/dotnet.js`, window.location.origin).href;
      const { dotnet } = await importModule(url);
      const { getAssemblyExports, getConfig } = await dotnet.create();
      const exports = await getAssemblyExports(getConfig().mainAssemblyName);
      return exports.Relay.Nodes.Wasm.NodeExports as NodeExports;
    })().catch((err) => {
      loading = null; // permite tentar de novo
      throw err;
    });
  }
  return loading;
}

export async function executeNode(nodeType: string, input: unknown): Promise<NodeResult> {
  const nodes = await loadDotnet();
  return JSON.parse(nodes.Execute(nodeType, JSON.stringify(input))) as NodeResult;
}