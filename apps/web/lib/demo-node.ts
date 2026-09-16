import type { NodeExecutor, NodeResult } from "@relay/engine";

const fail = (code: string, message: string): NodeResult => ({ ok: false, error: { code, message } });

export function createDemoExecutor(): NodeExecutor {
    const tentativas = new Map<string, number>();

    return {
        async execute(type, input) {
            const dados = (input ?? {}) as Record<string, unknown>;

            switch (type) {
                case 'texto.maiusculas': {
                    if (typeof dados.texto !== 'string') return fail('entrada_invalida', "o campo 'texto' deve ser texto");
                    return { ok: true, output: { texto: dados.texto.toLocaleUpperCase('pt-BR') } };
                }
                case 'demo.instavel': {
                const falhasAntes = Number(dados.falhasAntes ?? 0);
                const n = (tentativas.get(type) ?? 0) + 1;
                tentativas.set(type, n);
                if (n <= falhasAntes) return fail('falha_interna', `falha simulada na tentativa ${n}`);
                return { ok: true, output: { tentativas: n } };
                }
                default:
                    return fail('node desconhecido', `nó '${type}' não existe no runtime ts`);
            }
        },
    };
}
