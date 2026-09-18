import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from './types';

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  browser?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface MessagesResponse {
  content?: ContentBlock[];
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function mapStatus(status: number, detail: string): LLMError {
  if (status === 401 || status === 403) return new LLMError('chave_invalida', `a chave foi recusada (${detail})`, false);
  if (status === 400 || status === 422) return new LLMError('requisicao_invalida', detail, false);
  if (status === 404) return new LLMError('modelo_inexistente', detail, false);
  if (status === 429) return new LLMError('limite_de_taxa', detail, true);
  if (status === 529) return new LLMError('sobrecarregado', detail, true);
  if (status >= 500) return new LLMError('falha_do_provedor', `HTTP ${status}: ${detail}`, true);
  return new LLMError('falha_do_provedor', `HTTP ${status}: ${detail}`, false);
}

export function createAnthropicClient(options: AnthropicOptions): LLMClient {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    baseUrl = 'https://api.anthropic.com',
    browser = false,
    timeoutMs = 60_000,
    fetch: doFetch = fetch,
  } = options;

  if (!apiKey.trim()) throw new LLMError('chave_ausente', 'a chave da API está vazia', false);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';

  return {
    label: `Anthropic · ${model}`,
    model,

    async complete({ system, prompt, maxTokens = 1024, temperature }: LLMRequest): Promise<LLMResponse> {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl.replace(/\/+$/, '')}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            ...(system ? { system } : {}),
            ...(temperature === undefined ? {} : { temperature }),
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : 'erro';
        throw new LLMError('rede_indisponivel', `não foi possível falar com a API (${name})`, true);
      }

      const raw = await response.text();

      if (!response.ok) {
        let detail = `resposta de ${raw.length} caracteres`;
        try {
          const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
          if (parsed.error?.message) detail = parsed.error.message;
          else if (parsed.error?.type) detail = parsed.error.type;
        } catch {
          if (raw.trim()) detail = raw.slice(0, 200);
        }
        throw mapStatus(response.status, detail.replace(apiKey, '[chave]'));
      }

      let body: MessagesResponse;
      try {
        body = JSON.parse(raw) as MessagesResponse;
      } catch {
        throw new LLMError('resposta_malformada', 'a API devolveu texto que não é JSON', true);
      }

      const text = (body.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
        .trim();

      if (!text) throw new LLMError('resposta_vazia', 'a API não devolveu nenhum bloco de texto', true);

      return {
        text,
        model: body.model ?? model,
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      };
    },
  };
}