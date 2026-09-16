import { createDotnetExecutor, loadDotnetModule, type DotnetExports } from '@relay/dotnet-host';

const importModule = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

let loading: Promise<DotnetExports> | null = null;

export function loadDotnet(): Promise<DotnetExports> {
  if (!loading) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const url = new URL(`${base}/dotnet/_framework/dotnet.js`, window.location.origin).href;
    loading = loadDotnetModule(url, importModule).catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export const dotnetExecutor = createDotnetExecutor(loadDotnet);