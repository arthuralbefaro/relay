import type { NodeExecutor, NodeResult, RetryPolicy } from '@relay/engine';

type Config = Record<string, unknown>;

interface BaseSpec {
    type: string;
    label: string;
    description: string;
    idPrefix: string;
    defaultConfig: Config;
    defaultRetry?: RetryPolicy;
}

export type NodeSpec =
    | (BaseSpec & { runtime: 'dotnet' })
    | (BaseSpec & { runtime: 'ts'; execute: (input: Config, ctx: { attempt: number }) => NodeResult });

const fail = (code: string, message: string): NodeResult => ({ ok: false, error: { code, message } });    

const asObject = (input: unknown): Config =>
    input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Config) : {};

export const NODE_CATALOG: readonly NodeSpec[] = [
  {
    type: 'hello',
    runtime: 'dotnet',
    label: 'Saudação',
    description: 'C# em WebAssembly. Monta "Olá, <nome>!".',
    idPrefix: 'saudacao',
    defaultConfig: { name: '=trigger.nome' },
  },
  {
    type: 'texto.maiusculas',
    runtime: 'ts',
    label: 'Maiúsculas',
    description: 'Converte o campo texto para maiúsculas.',
    idPrefix: 'maiusculas',
    defaultConfig: { texto: '' },
    execute: (input) =>
      typeof input.texto === 'string'
        ? { ok: true, output: { texto: input.texto.toLocaleUpperCase('pt-BR') } }
        : fail('entrada_invalida', "o campo 'texto' deve ser texto"),
  },
  {
    type: 'texto.juntar',
    runtime: 'ts',
    label: 'Juntar textos',
    description: 'Junta uma lista de textos e números com um separador.',
    idPrefix: 'juntar',
    defaultConfig: { partes: [], separador: ' ' },
    execute: (input) => {
      const { partes, separador = '' } = input;
      if (!Array.isArray(partes) || !partes.every((p) => typeof p === 'string' || typeof p === 'number')) {
        return fail('entrada_invalida', "'partes' deve ser uma lista de textos ou números");
      }
      if (typeof separador !== 'string') return fail('entrada_invalida', "'separador' deve ser texto");
      return { ok: true, output: { texto: partes.map(String).join(separador) } };
    },
  },
  {
    type: 'demo.instavel',
    runtime: 'ts',
    label: 'Instável',
    description: 'Falha N vezes com falha_interna antes de funcionar. Serve para ver o retry.',
    idPrefix: 'instavel',
    defaultConfig: { falhasAntes: 2 },
    defaultRetry: { maxAttempts: 3, backoffMs: 300 },
    execute: (input, { attempt }) => {
      const { falhasAntes } = input;
      if (typeof falhasAntes !== 'number' || !Number.isInteger(falhasAntes) || falhasAntes < 0) {
        return fail('entrada_invalida', "'falhasAntes' deve ser um inteiro >= 0");
      }
      return attempt <= falhasAntes
        ? fail('falha_interna', `falha simulada na tentativa ${attempt}`)
        : { ok: true, output: { tentativas: attempt } };
    },
  },
];

const byType = new Map(NODE_CATALOG.map((spec) => [spec.type, spec]));

export const getSpec = (type: string): NodeSpec | undefined => byType.get(type);

export function createTsExecutor(): NodeExecutor {
    const attempts = new Map<string, number>();
    return {
        async execute(type, input) {
            const spec = byType.get(type);
            if (!spec || spec.runtime !== 'ts') return fail('node_Desconhecido', `nó '${type}' não existe no runtime ts`);
            const key = `${type}:${JSON.stringify(input)}`;
            const attempt = (attempts.get(key) ?? 0) + 1;
            attempts.set(key, attempt);
            return spec.execute(asObject(input), { attempt });
        },
    };
}