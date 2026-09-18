import { describe, expect, it } from 'vitest';
import { JsonExtractionError, extractJsonObject } from '../src/index';

describe('extractJsonObject', () => {
  it('lê um objeto simples', () => {
    expect(extractJsonObject('{"valor":"a"}')).toEqual({ valor: 'a' });
  });

  it('ignora a prosa em volta', () => {
    expect(extractJsonObject('Claro! Aqui está: {"valor":"a"} Espero ter ajudado.')).toEqual({ valor: 'a' });
  });

  it('lê de dentro de um bloco de código', () => {
    expect(extractJsonObject('```json\n{"valor":"a"}\n```')).toEqual({ valor: 'a' });
  });

  it('para no fechamento certo quando há outro objeto depois', () => {
    expect(extractJsonObject('{"valor":"a"} {"valor":"b"}')).toEqual({ valor: 'a' });
  });

  it('não se perde com chaves dentro de string', () => {
    expect(extractJsonObject('{"valor":"} nao fecha aqui","ok":true}')).toEqual({ valor: '} nao fecha aqui', ok: true });
  });

  it('respeita aspas escapadas', () => {
    expect(extractJsonObject('{"valor":"diz \\"oi\\" }","ok":1}')).toEqual({ valor: 'diz "oi" }', ok: 1 });
  });

  it('lê objeto aninhado inteiro', () => {
    expect(extractJsonObject('ruído {"a":{"b":{"c":2}}} mais ruído')).toEqual({ a: { b: { c: 2 } } });
  });

  it('falha quando não há objeto', () => {
    expect(() => extractJsonObject('sem json aqui')).toThrow(JsonExtractionError);
  });

  it('falha quando o objeto não fecha', () => {
    expect(() => extractJsonObject('{"valor":')).toThrow('não fecha');
  });
});