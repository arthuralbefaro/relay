import { describe, expect, it } from 'vitest';
import { createRecordedClient } from '../src/index';

describe('cliente de respostas gravadas', () => {
  it('escolhe a resposta pelo trecho que casa', async () => {
    const client = createRecordedClient([{ match: 'resuma', text: 'resumo gravado' }]);
    expect((await client.complete({ prompt: 'Resuma este texto' })).text).toBe('resumo gravado');
  });

  it('cai no texto padrão quando nada casa e se identifica como gravado', async () => {
    const client = createRecordedClient([{ match: 'resuma', text: 'resumo gravado' }]);
    const response = await client.complete({ prompt: 'qualquer outra coisa' });
    expect(response.text).toContain('gravada');
    expect(response.model).toBe('gravado');
  });
});