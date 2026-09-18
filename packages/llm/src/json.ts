export class JsonExtractionError extends Error {
    override name = 'JsonExtractionError';
}

export function extractJsonObject(text: string): unknown {
    const start = text.indexOf('{');
    if (start === -1) throw new JsonExtractionError('a resposta não contém nenhum objeto JSON');

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i]!;

        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char ==='"') inString = false;
            continue;
        }

        if (char === '"') inString = true;
        else if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) {
                const slice = text.slice(start, i + 1);
                try {
                    return JSON.parse(slice);
                } catch {
                    throw new JsonExtractionError('o trecho delimitado por chaves não é um JSON válido');
                }
            }
        }
    }

    throw new JsonExtractionError('o objeto JSON começa mas não fecha');
}