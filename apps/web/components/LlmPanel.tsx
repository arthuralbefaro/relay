'use client';

import { useEffect, useState } from 'react';
import { MODELOS, readKey, readModel, writeKey, writeModel } from '@/lib/llm';

export function LlmPanel() {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(MODELOS[0] as string);
  const [salvo, setSalvo] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const stored = readKey();
    if (stored) {
      setKey(stored);
      setSalvo(true);
    }
    setModel(readModel());
    setPronto(true);
  }, []);

  if (!pronto) return null;

  function salvar() {
    const limpa = key.trim();
    writeKey(limpa || null);
    writeModel(model);
    setSalvo(Boolean(limpa));
  }

  function limpar() {
    writeKey(null);
    setKey('');
    setSalvo(false);
  }

  return (
    <section>
      <h2>Modelo de IA</h2>
      <p className="muted">
        {salvo
          ? 'Usando sua chave. Os nós de IA chamam a API direto do navegador.'
          : 'Sem chave, os nós de IA devolvem respostas gravadas.'}
      </p>

      <label className="field">
        <span>Chave da API (Anthropic)</span>
        <input
          type="password"
          value={key}
          placeholder="sk-ant-..."
          autoComplete="off"
          onChange={(e) => {
            setKey(e.target.value);
            setSalvo(false);
          }}
        />
      </label>

      <label className="field">
        <span>Modelo</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <button className="secondary" onClick={salvar}>
          Salvar
        </button>
        {salvo && (
          <button className="danger" onClick={limpar}>
            Remover
          </button>
        )}
      </div>

      <p className="muted">
        A chave fica só nesta aba e some quando você a fecha. Nada é enviado ao servidor do Relay.
      </p>
    </section>
  );
}