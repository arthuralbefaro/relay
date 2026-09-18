import { describe, expect, it } from 'vitest';
import { LLMError, createAnthropicClient } from '../src/index';

const CHAVE = 'sk-ant-chave-secreta';

function clientWith(respond: (url: string, init: RequestInit) => Response, browser = false) {
  const calls: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;

  return { client: createAnthropicClient({ apiKey: CHAVE, fetch: doFetch, browser }), calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const erro = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status });

describe('cliente da Anthropic', () => {
  it('monta a requisição com a chave, a versão e o corpo esperados', async () => {
    const { client, calls } = clientWith(() =>
      ok({ content: [{ type: 'text', text: 'oi' }], model: 'm', usage: { input_tokens: 3, output_tokens: 4 } }),
    );

    await client.complete({ prompt: 'diga oi', system: 'seja breve', maxTokens: 50, temperature: 0 });

    const { url, init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe(CHAVE);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
    expect(JSON.parse(String(init.body))).toMatchObject({
      max_tokens: 50,
      system: 'seja breve',
      temperature: 0,
      messages: [{ role: 'user', content: 'diga oi' }],
    });
  });

  it('manda o cabeçalho de acesso direto quando roda no navegador', async () => {
    const { client, calls } = clientWith(() => ok({ content: [{ type: 'text', text: 'oi' }] }), true);
    await client.complete({ prompt: 'x' });
    expect((calls[0]!.init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('junta os blocos de texto e devolve o uso de tokens', async () => {
    const { client } = clientWith(() =>
      ok({
        content: [{ type: 'text', text: 'parte um ' }, { type: 'thinking' }, { type: 'text', text: 'parte dois' }],
        model: 'claude-x',
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    );

    expect(await client.complete({ prompt: 'x' })).toEqual({
      text: 'parte um parte dois',
      model: 'claude-x',
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it('401 vira chave_invalida e não é repetível', async () => {
    const { client } = clientWith(() => erro(401, 'authentication_error', 'invalid x-api-key'));
    await expect(client.complete({ prompt: 'x' })).rejects.toMatchObject({ code: 'chave_invalida', retryable: false });
  });

  it('429 e 529 são repetíveis', async () => {
    const limite = clientWith(() => erro(429, 'rate_limit_error', 'devagar'));
    const sobrecarga = clientWith(() => erro(529, 'overloaded_error', 'cheio'));

    await expect(limite.client.complete({ prompt: 'x' })).rejects.toMatchObject({ code: 'limite_de_taxa', retryable: true });
    await expect(sobrecarga.client.complete({ prompt: 'x' })).rejects.toMatchObject({ code: 'sobrecarregado', retryable: true });
  });

  it('falha de rede vira rede_indisponivel repetível', async () => {
    const client = createAnthropicClient({
      apiKey: CHAVE,
      fetch: (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch,
    });
    await expect(client.complete({ prompt: 'x' })).rejects.toMatchObject({ code: 'rede_indisponivel', retryable: true });
  });

  it('resposta sem bloco de texto é tratada como falha', async () => {
    const { client } = clientWith(() => ok({ content: [{ type: 'thinking' }] }));
    await expect(client.complete({ prompt: 'x' })).rejects.toMatchObject({ code: 'resposta_vazia' });
  });

  it('a chave nunca aparece na mensagem de erro', async () => {
    const { client } = clientWith(() => erro(400, 'invalid_request_error', `a chave ${CHAVE} nao serve`));
    await expect(client.complete({ prompt: 'x' })).rejects.toThrow(/\[chave\]/);
    await expect(client.complete({ prompt: 'x' })).rejects.not.toThrow(new RegExp(CHAVE));
  });

  it('recusa chave vazia na criação', () => {
    expect(() => createAnthropicClient({ apiKey: '   ' })).toThrow(LLMError);
  });
});