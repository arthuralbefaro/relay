const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const total = Number(process.env.BENCH_TOTAL ?? 50);
const parallel = Number(process.env.BENCH_PARALLEL ?? 10);
const flowId = process.env.BENCH_FLOW ?? 'bench';

const flow = {
    name: 'benchmark',
    definition: {
        nodes: [
            { id: 'saudacao', type: 'hello', runtime: 'dotnet', config: { name: '=trigger.nome' } },
            { id: 'maiusculas', type: 'texto.maiusculas', runtime: 'ts', config: { texto: '=steps.saudacao.message' } },
        ],
        edges: [{ from: 'saudacao', to: 'maiusculas' }],
    },
    layout: {}
};

async function call(path, init) {
    const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${path} respondeu HTTP ${response.status}: ${text}`);
    return body;
}

async function runOne(index) {
    const started = performance.now();
    const { executionId } = await call(`/flows/${flowId}/executions`, {
        method: 'POST',
        body: JSON.stringify({ nome: `carga ${index}` }),
    });

    for (;;) {
        const result = await call (`/executions/${executionId}`);
        if (result.state === 'concluida') {
            return { latency: performance.now() - started, status: result.execution.execution.status };
        }
        if (result.state === 'falhou_na_infra') throw new Error(`job ${executionId}: ${result.reason ?? 'sem motivo'}`);
        await new Promise((r) => setTimeout(r, 25));
    }
}

const health = await call('/health').catch((e) => {
    console.error(`API indisponível em ${apiUrl}, suba a pilha com o "pnpm stack"`);
    console.error(String(e));
    process.exit(1);
})
console.log(`api ok (db ${health.db}, redis: ${health.redis})`);

await call(`/flows/${flowId}`, { method: 'PUT', body: JSON.stringify(flow) });
await runOne(0);

const queue = Array.from({ length: total}, (_, i) => i + 1);
const latencies = [];
const failures = [];
const started = performance.now();

await Promise.all(
    Array.from({ length: parallel }, async () => {
        for (;;) {
            const index = queue.shift();
            if (index === undefined) return;
            try {
                const result = await runOne(index);
                latencies.push(result.latency);
                if (result.status !== 'sucesso') failures.push(`execução ${index}: ${result.status}`);
            } catch (e) {
                failures.push(`execução: ${index}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }),
);

const elapsed = (performance.now() - started) / 1000;
const sorted = latencies.sort((a, b) => a - b);
const at = (q) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0);

console.log(`\nexecuções: ${total} · disparos simultâneos: ${parallel}`);
console.log(`tempo total: ${elapsed.toFixed(1)} s`);
console.log(`vazão: ${(total / elapsed).toFixed(1)} execuções/s (${Math.round((total / elapsed) * 60)}/min)`);
console.log(`latência p50: ${at(0.5)} ms · p95: ${at(0.95)} ms · máx: ${at(1)} ms`);
console.log(failures.length === 0 ? 'nenhuma falha' : `falhas: ${failures.length}`);
for (const failure of failures.slice(0, 5)) console.log(`  ${failure}`);