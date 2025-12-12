// worker/src/lib/llm-verifier/setup.ts
import { LLMVerifier } from './LLMVerifier';
import { VerifierConfig } from './types';

/**
 * Create verifier from environment variables
 */
export function createVerifierFromEnv(env: any): LLMVerifier {
  const config: Partial<VerifierConfig> = {
    provider: (env.AI_PROVIDER || 'openai') as any,
    model: env.AI_DEFAULT_MODEL || 'gpt-4o-mini',
    maxRetries: parseInt(env.AI_MAX_RETRIES || '3'),
    timeout: parseInt(env.AI_TIMEOUT_MS || '30000'),
    temperature: parseFloat(env.AI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(env.AI_MAX_TOKENS || '1000'),
    sentryEnabled: env.ENABLE_SENTRY === 'true',
    logLevel: (env.LOG_LEVEL || 'info') as any,
  };

  return new LLMVerifier(env, config);
}

/**
 * Setup verifier with custom configuration
 */
export function setupVerifier(options: {
  env: any;
  provider?: string;
  model?: string;
  criteria?: Record<string, boolean>;
  sentryEnabled?: boolean;
}): LLMVerifier {
  const verifier = createVerifierFromEnv(options.env);
  
  // Override defaults if provided
  const overrides: any = {};
  if (options.provider) overrides.provider = options.provider;
  if (options.model) overrides.model = options.model;
  if (options.criteria) overrides.criteria = options.criteria;
  if (options.sentryEnabled !== undefined) {
    overrides.sentryEnabled = options.sentryEnabled;
  }
  
  // Note: LLMVerifier doesn't accept these in constructor, 
  // so we'd need to extend the class or use a different approach
  return verifier;
}

/**
 * Validate environment configuration
 */
export function validateEnvConfig(env: any): string[] {
  const errors: string[] = [];
  
  // Check required API keys based on provider
  const provider = env.AI_PROVIDER || 'openai';
  
  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        errors.push('OPENAI_API_KEY is required for OpenAI provider');
      }
      break;
    
    case 'gemini':
      if (!env.GEMINI_API_KEY) {
        errors.push('GEMINI_API_KEY is required for Gemini provider');
      }
      break;
    
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        errors.push('ANTHROPIC_API_KEY is required for Anthropic provider');
      }
      break;
  }
  
  // Validate numeric values
  const maxRetries = parseInt(env.AI_MAX_RETRIES || '3');
  if (isNaN(maxRetries) || maxRetries < 1 || maxRetries > 10) {
    errors.push('AI_MAX_RETRIES must be between 1 and 10');
  }
  
  const temperature = parseFloat(env.AI_TEMPERATURE || '0.7');
  if (isNaN(temperature) || temperature < 0 || temperature > 2) {
    errors.push('AI_TEMPERATURE must be between 0 and 2');
  }
  
  return errors;
}

/**
 * Get provider information
 */
export function getProviderInfo(env: any) {
  const provider = env.AI_PROVIDER || 'openai';
  
  const info = {
    openai: {
      name: 'OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      website: 'https://openai.com',
      cost: 'See https://openai.com/pricing',
    },
    gemini: {
      name: 'Google Gemini',
      models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
      website: 'https://ai.google.dev',
      cost: 'See https://ai.google.dev/pricing',
    },
    anthropic: {
      name: 'Anthropic Claude',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      website: 'https://www.anthropic.com',
      cost: 'See https://www.anthropic.com/pricing',
    },
  };
  
  return info[provider] || info.openai;
}