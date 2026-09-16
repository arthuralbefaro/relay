'use client';

import { useState } from 'react';
import { executeNode, loadDotnet, type NodeResult } from '@/lib/dotnet';

type Status = 'ocioso' | 'carregando' | 'pronto' | 'erro';

export default function Home() {
  const [name, setName] = useState('Arthur');
  const [status, setStatus] = useState<Status>('ocioso');
  const [runtime, setRuntime] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [result, setResult] = useState<NodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(input: unknown) {
    setError(null);
    try {
      if (status !== 'pronto') {
        setStatus('carregando');
        const t0 = performance.now();
        const nodes = await loadDotnet();
        setLoadMs(Math.round(performance.now() - t0));
        setRuntime(nodes.RuntimeInfo());
        setStatus('pronto');
      }
      setResult(await executeNode('hello', input));
    } catch (e) {
      setStatus('erro');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <h1>Relay</h1>
      <p className="muted">
        O nó abaixo é C# compilado para WebAssembly. Nenhum servidor envolvido.
      </p>

      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
        <button onClick={() => run({ name })} disabled={status === 'carregando'}>
          {status === 'carregando' ? 'Carregando runtime .NET…' : 'Executar nó hello'}
        </button>
        <button className="secondary" onClick={() => run({})} disabled={status === 'carregando'}>
          Enviar entrada inválida
        </button>
      </div>

      <p className="muted">
        Status: {status}
        {loadMs !== null && ` · runtime carregado em ${loadMs} ms`}
        {runtime && ` · ${runtime}`}
      </p>

      {error && <pre>Falha ao carregar: {error}</pre>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  );
}