export interface LLMRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class LLMError extends Error {
  override name = 'LLMError';

  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface LLMClient {
  readonly label: string;
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}