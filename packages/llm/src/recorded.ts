import type { LLMClient, LLMRequest, LLMResponse } from './types';

export interface RecordedAnswer {
  match: string;
  text: string;
}

export const DEMO_ANSWERS: readonly RecordedAnswer[] = [
  {
    match: 'classifique',
    text: '{"valor": null, "evidencia": "resposta gravada: sem chave, o modelo nao foi consultado"}',
  },
  {
    match: 'resuma',
    text: 'Resposta gravada. Informe uma chave da API para receber um resumo real deste texto.',
  },
];

const FALLBACK =
  'Resposta gravada. Esta demonstração roda sem chave de API, então nenhum modelo foi consultado. ' +
  'Informe sua própria chave no painel à esquerda para ver a resposta real.';

export function createRecordedClient(answers: readonly RecordedAnswer[] = DEMO_ANSWERS): LLMClient {
  return {
    label: 'respostas gravadas (sem chave)',
    model: 'gravado',

    async complete({ system, prompt }: LLMRequest): Promise<LLMResponse> {
      const haystack = `${system ?? ''}\n${prompt}`.toLowerCase();
      const hit = answers.find((answer) => haystack.includes(answer.match.toLowerCase()));
      return {
        text: hit ? hit.text : FALLBACK,
        model: 'gravado',
        inputTokens: 0,
        outputTokens: 0,
      };
    },
  };
}