export interface ResolveContext {
    trigger: unknown;
    steps: Record<string, unknown>;
}

export class ResolveError extends Error {
    override name = 'ResolveError';
}

export function isReference(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('=') && !value.startsWith('==');
}

export function referencePath(expr: string): string[] {
    return expr.slice(1).split('.').map((segment) => segment.trim());
}

export function collectReferences(value: unknown): string[][] {
    if (isReference(value)) return [referencePath(value)];
    if (Array.isArray(value)) return value.flatMap(collectReferences);
    if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectReferences);
    return [];
}

export function resolveInput(value: unknown, ctx: ResolveContext): unknown {
    if (typeof value === 'string') {
        if (value.startsWith('==')) return value.slice(1);
        if (value.startsWith('=')) return lookup(referencePath(value), ctx, value);
        return value;
    }
    if (Array.isArray(value)) return value.map((item) => resolveInput(item, ctx));
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveInput(item, ctx)]));
    }
    return value;
}

function lookup(path: string[], ctx: ResolveContext, expr: string): unknown {
    let current: unknown = ctx;
    for (const segment of path) {
        if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
            throw new ResolveError(`a referência '${expr}' não existe: falta '${segment}'`);
        }
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}