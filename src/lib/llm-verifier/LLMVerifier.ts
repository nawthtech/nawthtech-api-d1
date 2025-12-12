// worker/src/lib/llm-verifier/LLMVerifier.ts
import * as Sentry from '@sentry/cloudflare';
import { 
  VerificationResult, 
  VerificationCriteria,
  VerificationOptions,
  LLMResponse,
  VerificationMetrics,
  ProviderConfig 
} from './types';
import { 
  parseLLMResponse, 
  extractJSONFromText,
  calculateConfidence,
  sleep,
  buildVerificationPrompt,
  isRetryableError,
  logVerification 
} from './utils';

export class LLMVerifier {
  private client: any;
  private logger: any;
  private defaultModel: string;
  private maxRetries: number;
  private timeout: number;
  private temperature: number;
  private maxTokens: number;
  private criteria: VerificationCriteria;
  private providerConfig: ProviderConfig;
  private sentryEnabled: boolean;

  constructor(
    env: any,
    options: Partial<{
      model: string;
      maxRetries: number;
      timeout: number;
      temperature: number;
      maxTokens: number;
      criteria: Partial<VerificationCriteria>;
      provider: string;
      sentryEnabled: boolean;
    }> = {}
  ) {
    // Initialize configuration
    this.defaultModel = options.model || env.AI_DEFAULT_MODEL || 'gpt-4o-mini';
    this.maxRetries = options.maxRetries || parseInt(env.AI_MAX_RETRIES || '3');
    this.timeout = options.timeout || parseInt(env.AI_TIMEOUT_MS || '30000');
    this.temperature = options.temperature || parseFloat(env.AI_TEMPERATURE || '0.7');
    this.maxTokens = options.maxTokens || parseInt(env.AI_MAX_TOKENS || '1000');
    this.sentryEnabled = options.sentryEnabled ?? (env.ENABLE_SENTRY === 'true');

    // Initialize verification criteria
    this.criteria = {
      toxicity: options.criteria?.toxicity ?? (env.VERIFY_TOXICITY === 'true'),
      factuality: options.criteria?.factuality ?? (env.VERIFY_FACTUALITY === 'true'),
      coherence: options.criteria?.coherence ?? (env.VERIFY_COHERENCE === 'true'),
      relevance: options.criteria?.relevance ?? (env.VERIFY_RELEVANCE === 'true'),
      safety: options.criteria?.safety ?? (env.VERIFY_SAFETY === 'true'),
      moderation: options.criteria?.moderation ?? (env.VERIFY_MODERATION === 'true'),
      bias: options.criteria?.bias ?? (env.VERIFY_BIAS === 'true'),
    };

    // Initialize provider configuration
    this.providerConfig = this.initializeProvider(env, options.provider);

    // Initialize logger
    this.logger = this.initializeLogger();

    // Initialize client based on provider
    this.client = this.initializeClient();
  }

  /**
   * Initialize AI provider
   */
  private initializeProvider(env: any, provider?: string): ProviderConfig {
    const providerName = provider || env.AI_PROVIDER || 'openai';
    
    const configs: Record<string, ProviderConfig> = {
      openai: {
        name: 'openai',
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        models: {
          default: 'gpt-4o-mini',
          fast: 'gpt-4o-mini',
          accurate: 'gpt-4o',
          cheap: 'gpt-3.5-turbo',
        },
        endpoints: {
          completions: '/completions',
          chat: '/chat/completions',
        },
        costPer1KTokens: {
          input: 0.0005,
          output: 0.0015,
        },
      },
      gemini: {
        name: 'gemini',
        apiKey: env.GEMINI_API_KEY,
        baseURL: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1',
        models: {
          default: 'gemini-1.5-pro',
          fast: 'gemini-1.5-flash',
          accurate: 'gemini-1.5-pro',
        },
        endpoints: {
          generate: '/models/{model}:generateContent',
        },
        costPer1KTokens: {
          input: 0.000125,
          output: 0.000375,
        },
      },
      anthropic: {
        name: 'anthropic',
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        models: {
          default: 'claude-3-haiku',
          fast: 'claude-3-haiku',
          accurate: 'claude-3-opus',
        },
        endpoints: {
          messages: '/messages',
        },
        costPer1KTokens: {
          input: 0.00025,
          output: 0.00125,
        },
      },
    };

    return configs[providerName] || configs.openai;
  }

  /**
   * Initialize logger
   */
  private initializeLogger() {
    return {
      info: (message: string, data?: any) => {
        console.log(`[LLMVerifier] INFO: ${message}`, data || '');
      },
      warn: (message: string, data?: any) => {
        console.warn(`[LLMVerifier] WARN: ${message}`, data || '');
      },
      error: (message: string, error?: any) => {
        console.error(`[LLMVerifier] ERROR: ${message}`, error || '');
      },
      debug: (message: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[LLMVerifier] DEBUG: ${message}`, data || '');
        }
      },
    };
  }

  /**
   * Initialize AI client
   */
  private initializeClient() {
    switch (this.providerConfig.name) {
      case 'openai':
        // @ts-ignore - Cloudflare Workers compatible OpenAI client
        return new OpenAI({ 
          apiKey: this.providerConfig.apiKey,
          baseURL: this.providerConfig.baseURL,
        });
      
      case 'gemini':
        // @ts-ignore - Gemini client
        return new GoogleGenerativeAI(this.providerConfig.apiKey);
      
      case 'anthropic':
        // @ts-ignore - Anthropic client
        return new Anthropic({ 
          apiKey: this.providerConfig.apiKey,
          baseURL: this.providerConfig.baseURL,
        });
      
      default:
        throw new Error(`Unsupported provider: ${this.providerConfig.name}`);
    }
  }

  /**
   * Verify content using LLM
   */
  async verify(
    input: string, 
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const transaction = Sentry.startTransaction({
      name: `llm.verification.${options.type || 'general'}`,
      op: 'ai.verification',
    });

    try {
      // Start performance monitoring
      const startTime = Date.now();
      
      // Log verification start
      this.logger.info('Starting LLM verification', {
        inputLength: input.length,
        model: options.model || this.defaultModel,
        provider: this.providerConfig.name,
        criteria: this.criteria,
      });

      // Prepare verification prompt
      const verificationPrompt = buildVerificationPrompt(
        input, 
        this.criteria, 
        options.context
      );

      // Call LLM API with retry logic
      const llmResponse = await this.callLLMWithRetry(
        verificationPrompt, 
        options
      );

      // Parse verification result
      const result = parseLLMResponse(llmResponse, input);

      // Add performance metrics
      result.metrics = this.calculateMetrics(
        llmResponse, 
        startTime, 
        input
      );

      // Add provider information
      result.provider = this.providerConfig.name;
      result.model = options.model || this.defaultModel;

      // Log successful verification
      logVerification(result, this.logger);

      // Send to Sentry if enabled
      if (this.sentryEnabled) {
        this.sendToSentry(result, input, options);
      }

      transaction.setStatus('ok');
      transaction.setData('verification_result', {
        isValid: result.isValid,
        confidence: result.confidence,
        latency: result.metrics.latency,
      });

      return result;

    } catch (error) {
      // Handle verification error
      const errorResult = this.handleVerificationError(error, input, options);
      
      // Log error
      this.logger.error('LLM verification failed', {
        error: error.message,
        inputLength: input.length,
        provider: this.providerConfig.name,
      });

      // Send to Sentry
      if (this.sentryEnabled) {
        Sentry.captureException(error, {
          tags: {
            verification_type: options.type || 'general',
            llm_provider: this.providerConfig.name,
          },
          extra: {
            input_preview: input.substring(0, 200),
            options: options,
          },
        });
      }

      transaction.setStatus('error');
      return errorResult;

    } finally {
      transaction.finish();
    }
  }

  /**
   * Call LLM with retry logic
   */
  private async callLLMWithRetry(
    prompt: string, 
    options: VerificationOptions,
    retryCount: number = 0
  ): Promise<LLMResponse> {
    try {
      let response: any;

      switch (this.providerConfig.name) {
        case 'openai':
          response = await this.client.responses.create({
            model: options.model || this.defaultModel,
            input: prompt,
            temperature: options.temperature || this.temperature,
            max_tokens: options.maxTokens || this.maxTokens,
            timeout: this.timeout,
          });
          break;

        case 'gemini':
          const model = this.client.getGenerativeModel({ 
            model: options.model || this.defaultModel 
          });
          const geminiResult = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: options.temperature || this.temperature,
              maxOutputTokens: options.maxTokens || this.maxTokens,
            },
          });
          response = {
            output_text: geminiResult.response.text(),
            usage: {
              prompt_tokens: geminiResult.response.usageMetadata?.promptTokenCount || 0,
              completion_tokens: geminiResult.response.usageMetadata?.candidatesTokenCount || 0,
              total_tokens: geminiResult.response.usageMetadata?.totalTokenCount || 0,
            },
          };
          break;

        case 'anthropic':
          response = await this.client.messages.create({
            model: options.model || this.defaultModel,
            max_tokens: options.maxTokens || this.maxTokens,
            temperature: options.temperature || this.temperature,
            messages: [{ role: 'user', content: prompt }],
          });
          break;

        default:
          throw new Error(`Unsupported provider: ${this.providerConfig.name}`);
      }

      return response;

    } catch (error) {
      if (retryCount < this.maxRetries && isRetryableError(error)) {
        this.logger.warn(`LLM call failed, retrying (${retryCount + 1}/${this.maxRetries})`, {
          error: error.message,
          retryCount,
        });

        // Exponential backoff
        await sleep(Math.pow(2, retryCount) * 1000);
        return this.callLLMWithRetry(prompt, options, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Calculate verification metrics
   */
  private calculateMetrics(
    response: LLMResponse, 
    startTime: number, 
    input: string
  ): VerificationMetrics {
    const latency = Date.now() - startTime;
    const inputTokens = response.usage?.prompt_tokens || Math.ceil(input.length / 4);
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || inputTokens + outputTokens;

    // Calculate cost based on provider
    const cost = this.calculateCost(inputTokens, outputTokens);

    return {
      latency,
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      model: response.model || this.defaultModel,
      provider: this.providerConfig.name,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate cost based on tokens
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1000) * this.providerConfig.costPer1KTokens.input;
    const outputCost = (outputTokens / 1000) * this.providerConfig.costPer1KTokens.output;
    return inputCost + outputCost;
  }

  /**
   * Handle verification error
   */
  private handleVerificationError(
    error: any, 
    input: string, 
    options: VerificationOptions
  ): VerificationResult {
    return {
      isValid: false,
      confidence: 0,
      reason: `Verification failed: ${error.message}`,
      issues: ['LLM API error', error.message],
      suggestions: ['Please try again later', 'Check API key configuration'],
      categories: {},
      metrics: {
        latency: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        model: options.model || this.defaultModel,
        provider: this.providerConfig.name,
        timestamp: new Date().toISOString(),
      },
      provider: this.providerConfig.name,
      model: options.model || this.defaultModel,
      error: error.message,
      metadata: {
        errorType: error.constructor.name,
        errorCode: error.code || error.status,
        retryable: isRetryableError(error),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Send verification data to Sentry
   */
  private sendToSentry(
    result: VerificationResult, 
    input: string, 
    options: VerificationOptions
  ): void {
    Sentry.configureScope(scope => {
      scope.setExtra('verification_result', result);
      scope.setTag('verification.success', result.isValid.toString());
      scope.setTag('verification.provider', this.providerConfig.name);
      scope.setTag('verification.type', options.type || 'general');
      
      if (result.error) {
        scope.setTag('verification.error', 'true');
      }
    });

    // Capture custom event
    Sentry.captureMessage('LLM Verification Completed', {
      level: result.isValid ? 'info' : 'warning',
      extra: {
        inputLength: input.length,
        verificationResult: result,
        provider: this.providerConfig.name,
        model: options.model || this.defaultModel,
      },
    });
  }

  /**
   * Verify multiple inputs in batch
   */
  async verifyBatch(
    inputs: string[], 
    options: VerificationOptions = {}
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const batchSize = options.batchSize || 3;
    
    this.logger.info('Starting batch verification', {
      totalInputs: inputs.length,
      batchSize,
      provider: this.providerConfig.name,
    });

    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      this.logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
        batchStart: i,
        batchEnd: i + batch.length,
      });

      const batchPromises = batch.map((input, index) =>
        this.verify(input, {
          ...options,
          batchIndex: i + index,
          batchTotal: inputs.length,
        }).catch(error => this.handleVerificationError(error, input, options))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + batchSize < inputs.length) {
        await sleep(1000);
      }
    }

    this.logger.info('Batch verification completed', {
      totalVerified: results.length,
      validCount: results.filter(r => r.isValid).length,
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
    });

    return results;
  }

  /**
   * Get verification statistics
   */
  getStats(): any {
    return {
      provider: this.providerConfig.name,
      defaultModel: this.defaultModel,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      criteria: this.criteria,
      sentryEnabled: this.sentryEnabled,
      costPer1KTokens: this.providerConfig.costPer1KTokens,
    };
  }

  /**
   * Test LLM connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testPrompt = 'Hello, please respond with "OK"';
      const response = await this.callLLMWithRetry(testPrompt, {});
      
      const responseText = response.output_text || '';
      const isOk = responseText.includes('OK') || responseText.includes('ok');
      
      this.logger.info('LLM connection test', {
        success: isOk,
        provider: this.providerConfig.name,
        response: responseText.substring(0, 50),
      });

      return isOk;
    } catch (error) {
      this.logger.error('LLM connection test failed', {
        error: error.message,
        provider: this.providerConfig.name,
      });
      return false;
    }
  }
}