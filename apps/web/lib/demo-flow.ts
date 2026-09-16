import type { FlowDefinition } from '@relay/engine';

export const demoFlow: FlowDefinition = {
    id: 'demo',
    name: 'Saudação com retry',
    nodes: [
        { id: 'saudacao', type: 'hello', runtime: 'dotnet', config: { name: '=trigger.nome' } },
        { id: 'grito', type: 'texto.maiusculas', runtime: 'ts', config: { texto: '=steps.saudacao.message' } },
        {
        id: 'instavel',
        type: 'demo.instavel',
        runtime: 'ts',
        config: { falhasAntes: 2 },
        retry: { maxAttempts: 3, backoffMs: 300 },
        },
    ],
    edges: [{ from: 'saudacao', to: 'grito' }],
};