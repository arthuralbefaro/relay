import { DEFAULT_MODEL, createAnthropicClient, createRecordedClient, type LLMClient } from '@relay/llm';

const KEY_STORAGE = 'relay:anthropic-key';
const MODEL_STORAGE = 'relay:anthropic-model';

export const MODELOS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'] as const;

function read(name: string): string | null {
  try {
    return sessionStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value) sessionStorage.setItem(name, value);
    else sessionStorage.removeItem(name);
  } catch {
    return;
  }
}

export const readKey = (): string | null => read(KEY_STORAGE);
export const writeKey = (key: string | null): void => write(KEY_STORAGE, key);
export const readModel = (): string => read(MODEL_STORAGE) ?? DEFAULT_MODEL;
export const writeModel = (model: string): void => write(MODEL_STORAGE, model);

export function currentLlmClient(): LLMClient {
  const key = readKey();
  if (!key) return createRecordedClient();
  try {
    return createAnthropicClient({ apiKey: key, model: readModel(), browser: true });
  } catch {
    return createRecordedClient();
  }
}