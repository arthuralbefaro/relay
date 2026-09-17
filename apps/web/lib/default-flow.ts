import type { FlowLayout } from '@relay/db';
import type { FlowDefinition } from '@relay/engine';

export const FLOW_ID = 'principal';

export const defaultFlow: { definition: FlowDefinition; layout: FlowLayout } = {
  definition: {
    id: FLOW_ID,
    name: 'Saudação com retry',
    nodes: [
      { id: 'saudacao', type: 'hello', runtime: 'dotnet', config: { name: '=trigger.nome' } },
      { id: 'maiusculas', type: 'texto.maiusculas', runtime: 'ts', config: { texto: '=steps.saudacao.message' } },
      {
        id: 'instavel',
        type: 'demo.instavel',
        runtime: 'ts',
        config: { falhasAntes: 2 },
        retry: { maxAttempts: 3, backoffMs: 300 },
      },
      {
        id: 'juntar',
        type: 'texto.juntar',
        runtime: 'ts',
        config: {
          partes: ['=steps.maiusculas.texto', '— funcionou na tentativa', '=steps.instavel.tentativas'],
          separador: ' ',
        },
      },
    ],
    edges: [
      { from: 'saudacao', to: 'maiusculas' },
      { from: 'maiusculas', to: 'juntar' },
      { from: 'instavel', to: 'juntar' },
    ],
  },
  layout: {
    saudacao: { x: 0, y: 0 },
    maiusculas: { x: 260, y: 0 },
    instavel: { x: 260, y: 170 },
    juntar: { x: 520, y: 80 },
  },
};