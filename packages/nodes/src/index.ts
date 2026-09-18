import type { NodeExecutor, NodeResult, RetryPolicy } from '@relay/engine';
import { LLMError, extractJsonObject, type LLMClient } from '@relay/llm';

type Config = Record<string, unknown>;

export interface NodeContext {
  attempt: number;
  llm: LLMClient | null;
}

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
  | (BaseSpec & { runtime: 'ts'; execute: (input: Config, ctx: NodeContext) => NodeResult | Promise<NodeResult> });

const fail = (code: string, message: string): NodeResult => ({ ok: false, error: { code, message } });

const asObject = (input: unknown): Config =>
  input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Config) : {};

function fromLLMError(err: unknown): NodeResult {
  if (err instanceof LLMError) {
    return err.retryable
      ? fail('falha_interna', `${err.code}: ${err.message}`)
      : fail(err.code, err.message);
  }
  return fail('falha_interna', err instanceof Error ? `${err.name}: ${err.message}` : 'erro desconhecido no provedor');
}

function positiveInt(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export const NODE_CATALOG: readonly NodeSpec[] = [
  {
    type: 'hello',
    runtime: 'dotnet',
    label: 'Saudação',
    description: 'C# em WebAssembly ou no node-host. Monta "Olá, <nome>!".',
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
    type: 'ia.texto',
    runtime: 'ts',
    label: 'IA: texto livre',
    description: 'Manda o prompt ao modelo e devolve a resposta em texto.',
    idPrefix: 'ia_texto',
    defaultConfig: { prompt: 'Resuma em uma frase: =trigger.texto', maxTokens: 512 },
    defaultRetry: { maxAttempts: 3, backoffMs: 1000 },
    execute: async (input, { llm }) => {
      if (!llm) return fail('llm_indisponivel', 'nenhum provedor de modelo configurado');

      const { prompt, system, maxTokens } = input;
      if (typeof prompt !== 'string' || !prompt.trim()) {
        return fail('entrada_invalida', "'prompt' deve ser um texto não vazio");
      }
      if (system !== undefined && typeof system !== 'string') {
        return fail('entrada_invalida', "'system' deve ser texto");
      }
      const limit = positiveInt(maxTokens, 512);
      if (limit === null) return fail('entrada_invalida', "'maxTokens' deve ser um inteiro positivo");

      try {
        const response = await llm.complete({ prompt, system, maxTokens: limit });
        return {
          ok: true,
          output: {
            texto: response.text,
            modelo: response.model,
            tokens: { entrada: response.inputTokens, saida: response.outputTokens },
          },
        };
      } catch (err) {
        return fromLLMError(err);
      }
    },
  },
  {
    type: 'ia.classificar',
    runtime: 'ts',
    label: 'IA: classificar',
    description: 'Escolhe um valor da lista permitida, ou null quando nenhum serve.',
    idPrefix: 'ia_classificar',
    defaultConfig: { texto: '=trigger.texto', valores: ['positivo', 'negativo', 'neutro'] },
    defaultRetry: { maxAttempts: 3, backoffMs: 1000 },
    execute: async (input, { llm }) => {
      if (!llm) return fail('llm_indisponivel', 'nenhum provedor de modelo configurado');

      const { texto, valores, instrucao } = input;
      if (typeof texto !== 'string' || !texto.trim()) {
        return fail('entrada_invalida', "'texto' deve ser um texto não vazio");
      }
      if (!Array.isArray(valores) || valores.length === 0 || !valores.every((v) => typeof v === 'string' && v.trim())) {
        return fail('entrada_invalida', "'valores' deve ser uma lista não vazia de textos");
      }
      if (instrucao !== undefined && typeof instrucao !== 'string') {
        return fail('entrada_invalida', "'instrucao' deve ser texto");
      }

      const permitidos = valores as string[];
      const system = [
        'Você classifica textos escolhendo exatamente um valor de uma lista fechada.',
        instrucao ?? '',
        `Valores permitidos: ${permitidos.join(', ')}.`,
        'Se nenhum valor servir, devolva null.',
        'Responda apenas com um objeto JSON no formato {"valor": <valor ou null>, "evidencia": "<trecho curto do texto>"}.',
        'Não escreva nada fora do JSON.',
      ]
        .filter(Boolean)
        .join(' ');

      try {
        const response = await llm.complete({
          system,
          prompt: `Classifique o texto a seguir.\n\n${texto}`,
          maxTokens: 300,
          temperature: 0,
        });

        let parsed: Config;
        try {
          parsed = asObject(extractJsonObject(response.text));
        } catch (err) {
          return fail('resposta_nao_estruturada', err instanceof Error ? err.message : 'resposta ilegível');
        }

        const bruto = parsed.valor;
        const valor = typeof bruto === 'string' && permitidos.includes(bruto) ? bruto : null;
        const evidencia = typeof parsed.evidencia === 'string' ? parsed.evidencia.slice(0, 200) : '';

        return {
          ok: true,
          output: {
            valor,
            evidencia,
            fora_da_lista: valor === null && typeof bruto === 'string' ? bruto : null,
            modelo: response.model,
            tokens: { entrada: response.inputTokens, saida: response.outputTokens },
          },
        };
      } catch (err) {
        return fromLLMError(err);
      }
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

export interface TsExecutorOptions {
  llm?: LLMClient | null;
}

export function createTsExecutor({ llm = null }: TsExecutorOptions = {}): NodeExecutor {
  const attempts = new Map<string, number>();
  return {
    async execute(type, input) {
      const spec = byType.get(type);
      if (!spec || spec.runtime !== 'ts') return fail('node_desconhecido', `nó '${type}' não existe no runtime ts`);
      const key = `${type}:${JSON.stringify(input)}`;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      return spec.execute(asObject(input), { attempt, llm });
    },
  };
}