import { LLMError, type LLMClient } from '@relay/llm';
import { describe, expect, it } from 'vitest';
import { createTsExecutor } from '../src/index';

function stub(complete: LLMClient['complete']): LLMClient {
  return { label: 'stub', model: 'stub', complete };
}

const resposta = (text: string) => async () => ({ text, model: 'stub', inputTokens: 1, outputTokens: 2 });

describe('ia.texto', () => {
  it('sem provedor devolve llm_indisponivel', async () => {
    const executor = createTsExecutor();
    expect(await executor.execute('ia.texto', { prompt: 'oi' })).toEqual({
      ok: false,
      error: { code: 'llm_indisponivel', message: 'nenhum provedor de modelo configurado' },
    });
  });

  it('devolve texto, modelo e tokens', async () => {
    const executor = createTsExecutor({ llm: stub(resposta('tudo certo')) });
    expect(await executor.execute('ia.texto', { prompt: 'oi' })).toEqual({
      ok: true,
      output: { texto: 'tudo certo', modelo: 'stub', tokens: { entrada: 1, saida: 2 } },
    });
  });

  it('prompt vazio é entrada_invalida e não chama o provedor', async () => {
    let chamou = false;
    const executor = createTsExecutor({
      llm: stub(async () => {
        chamou = true;
        return { text: '', model: 'stub', inputTokens: 0, outputTokens: 0 };
      }),
    });
    const result = await executor.execute('ia.texto', { prompt: '   ' });
    expect(result).toMatchObject({ ok: false, error: { code: 'entrada_invalida' } });
    expect(chamou).toBe(false);
  });

  it('erro repetível do provedor vira falha_interna para o motor repetir', async () => {
    const executor = createTsExecutor({
      llm: stub(() => Promise.reject(new LLMError('limite_de_taxa', 'devagar', true))),
    });
    expect(await executor.execute('ia.texto', { prompt: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'falha_interna' },
    });
  });

  it('erro não repetível preserva o código original', async () => {
    const executor = createTsExecutor({
      llm: stub(() => Promise.reject(new LLMError('chave_invalida', 'recusada', false))),
    });
    expect(await executor.execute('ia.texto', { prompt: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'chave_invalida' },
    });
  });
});

describe('ia.classificar', () => {
  const config = { texto: 'adorei o atendimento', valores: ['positivo', 'negativo'] };

  it('aceita um valor da lista', async () => {
    const executor = createTsExecutor({
      llm: stub(resposta('{"valor":"positivo","evidencia":"adorei"}')),
    });
    expect(await executor.execute('ia.classificar', config)).toMatchObject({
      ok: true,
      output: { valor: 'positivo', evidencia: 'adorei', fora_da_lista: null },
    });
  });

  it('valor inventado vira null e fica registrado', async () => {
    const executor = createTsExecutor({
      llm: stub(resposta('{"valor":"empolgado","evidencia":"adorei"}')),
    });
    expect(await executor.execute('ia.classificar', config)).toMatchObject({
      ok: true,
      output: { valor: null, fora_da_lista: 'empolgado' },
    });
  });

  it('lê o JSON mesmo com prosa e cerca de código em volta', async () => {
    const executor = createTsExecutor({
      llm: stub(resposta('Claro!\n```json\n{"valor":"negativo","evidencia":"ruim"}\n```\nEspero ter ajudado.')),
    });
    expect(await executor.execute('ia.classificar', config)).toMatchObject({
      ok: true,
      output: { valor: 'negativo' },
    });
  });

  it('resposta sem JSON vira resposta_nao_estruturada, não valor nulo silencioso', async () => {
    const executor = createTsExecutor({ llm: stub(resposta('acho que é positivo')) });
    expect(await executor.execute('ia.classificar', config)).toMatchObject({
      ok: false,
      error: { code: 'resposta_nao_estruturada' },
    });
  });

  it('lista de valores vazia é entrada_invalida', async () => {
    const executor = createTsExecutor({ llm: stub(resposta('{}')) });
    expect(await executor.execute('ia.classificar', { texto: 'x', valores: [] })).toMatchObject({
      ok: false,
      error: { code: 'entrada_invalida' },
    });
  });
});