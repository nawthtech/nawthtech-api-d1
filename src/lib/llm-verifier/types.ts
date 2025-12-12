// worker/src/lib/llm-verifier/types.ts
export interface VerificationCriteria {
  toxicity: boolean;
  factuality: boolean;
  coherence: boolean;
  relevance: boolean;
  safety: boolean;
  moderation: boolean;
  bias: boolean;
  [key: string]: boolean;
}

export interface VerificationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  batchSize?: number;
  type?: 'content_safety' | 'fact_check' | 'quality' | 'moderation' | 'custom';
  context?: string;
  customCriteria?: Partial<VerificationCriteria>;
  timeout?: number;
  retryAttempts?: number;
  batchIndex?: number;
  batchTotal?: number;
  metadata?: Record<string, any>;
}

export interface VerificationResult {
  isValid: boolean;
  confidence: number; // 0-1
  reason: string;
  issues: string[];
  suggestions: string[];
  categories: Record<string, CategoryResult>;
  metrics: VerificationMetrics;
  provider?: string;
  model?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface CategoryResult {
  passed: boolean;
  score: number; // 0-1
  explanation: string;
  details?: string[];
}

export interface VerificationMetrics {
  latency: number; // milliseconds
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  model: string;
  provider: string;
  timestamp: string;
}

export interface LLMResponse {
  output_text: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  choices?: Array<{
    message: {
      content: string;
    };
  }>;
  data?: any;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  models: {
    default: string;
    fast: string;
    accurate: string;
    cheap?: string;
  };
  endpoints: Record<string, string>;
  costPer1KTokens: {
    input: number;
    output: number;
  };
}

export interface BatchVerificationResult {
  total: number;
  valid: number;
  invalid: number;
  averageConfidence: number;
  totalCost: number;
  totalTokens: number;
  results: VerificationResult[];
  summary: Record<string, number>;
}

export interface VerifierConfig {
  provider: 'openai' | 'gemini' | 'anthropic' | 'huggingface' | 'ollama';
  model: string;
  maxRetries: number;
  timeout: number;
  temperature: number;
  maxTokens: number;
  criteria: VerificationCriteria;
  sentryEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface SentryEvent {
  type: 'verification_success' | 'verification_failed' | 'llm_error';
  data: any;
  timestamp: string;
  environment: string;
}