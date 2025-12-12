/**
 * NawthTech Cloudflare Worker
 * Main entry point with D1 Database integration & AI Monitoring
 */

import { Router } from 'itty-router';
import { error, json, missing, status } from 'itty-router-extras';
import type { IRequest } from 'itty-router';

// Import handlers
import { handleHealthCheck } from './handlers/health';
import { handleCORS } from './middleware/cors';
import { authenticate, requireAuth, requireAdmin } from './middleware/auth';
import { validateRequest } from './middleware/validation';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUser,
  listUsers,
  getUserById,
} from './handlers/api/v1/auth';
import {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
} from './handlers/api/v1/services';
import {
  generateAI,
  getAIQuota,
  getAIRequests,
  getAIStats,
  getAIHealth,
  getAIAlerts,
  getAIMetrics,
  getLLMStats,
  monitorAIRequest,
  getAICapabilities,
  generateVideo,
  checkVideoStatus,
  analyzeImage,
  translateText,
  summarizeText,
  analyzeText,
  getAIProviders,
  getAIUsageStats,
} from './handlers/api/v1/ai';
import {
  handleEmailWebhook,
  getEmailLogs,
  getEmailConfig,
} from './handlers/webhooks/email';
import { handleStaticFile } from './handlers/static';
import { handleNotFound } from './handlers/notfound';
import type { Env, User } from './types/database';
import type { APIResponse } from './utils/responses';
import * as Sentry from '@sentry/cloudflare';
import { initSentry, withSentryErrorBoundary, captureMessage } from './sentry-setup.js';
import { LLMVerifier } from './lib/llm-verifier';

// Import AI monitoring
import { AIMonitoring } from './monitoring/ai-agents';

export interface Env {
  // Database bindings
  DB: D1Database;
  AI_MONITORING_DB: D1Database;
  
  // KV bindings for AI
  AI_CACHE: KVNamespace;
  AI_RATE_LIMIT: KVNamespace;
  
  // Analytics
  AI_ANALYTICS: AnalyticsEngineDataset;
  
  // R2 for AI models
  AI_MODELS: R2Bucket;
  
  // AI providers
  AI: Ai;
  
  // Environment variables
  ENVIRONMENT: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  HUGGINGFACE_TOKEN?: string;
  OLLAMA_BASE_URL?: string;
  ENABLE_OLLAMA?: string;
  AI_MONITORING_ENABLED?: string;
  AI_LOG_LEVEL?: string;
}

// Initialize Sentry with AI monitoring
const SentryInstance = Sentry.withSentry((env: Env) => ({
  dsn: env.SENTRY_DSN || "https://703dc8c9404510702c2c20ce3aba24d4@o4510508331892736.ingest.de.sentry.io/4510508452413520",
  environment: env.SENTRY_ENVIRONMENT || 'production',
  release: 'nawthtech-worker@1.0.0',
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  integrations: [
    new Sentry.CloudflareIntegration(),
    new Sentry.HttpIntegration({ tracing: true }),
    new Sentry.openAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
    new Sentry.ContextLinesIntegration(),
  ],
  beforeSend(event) {
    // Add custom context for nawthtech AI
    event.tags = {
      ...event.tags,
      platform: 'cloudflare-workers',
      service: 'nawthtech-ai-platform',
      app: 'nawthtech',
      component: 'ai-worker',
      ai_monitoring: env.AI_MONITORING_ENABLED || 'false',
    };
    
    // Add AI-specific context
    if (event.request?.headers?.get('x-ai-operation')) {
      event.contexts = {
        ...event.contexts,
        ai_operation: {
          operation: event.request.headers.get('x-ai-operation'),
          provider: event.request.headers.get('x-ai-provider'),
          model: event.request.headers.get('x-ai-model'),
        },
      };
    }
    
    return event;
  },
  beforeSendTransaction(event) {
    // Add AI-specific tags to transactions
    if (event.transaction?.startsWith('ai.')) {
      event.tags = {
        ...event.tags,
        transaction_type: 'ai_operation',
        ai_feature: event.transaction.split('.')[1],
      };
    }
    return event;
  },
}));

// Create AI monitoring instance
let aiMonitoring: AIMonitoring;

// Main worker export
export default SentryInstance({
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Initialize AI monitoring
    if (!aiMonitoring) {
      aiMonitoring = new AIMonitoring(env);
    }
    
    // Start Sentry transaction
    const transaction = Sentry.startTransaction({
      name: `${request.method} ${new URL(request.url).pathname}`,
      op: 'http.server',
    });
    
    Sentry.configureScope(scope => {
      scope.setSpan(transaction);
      scope.setTag('http.method', request.method);
      scope.setTag('http.url', request.url);
      scope.setTag('app.feature', 'ai-platform');
      scope.setTag('ai.monitoring.enabled', env.AI_MONITORING_ENABLED || 'false');
    });
    
    try {
      // Health check endpoint
      if (new URL(request.url).pathname === '/health') {
        captureMessage('Health check performed', 'info', {
          timestamp: new Date().toISOString(),
          ai_monitoring: env.AI_MONITORING_ENABLED,
        });
        return new Response('OK', { status: 200 });
      }
      
      // AI monitoring health endpoint
      if (new URL(request.url).pathname === '/api/v1/ai/monitoring/health') {
        const health = await aiMonitoring.checkAgentHealth('main-worker');
        return json(health);
      }
      
      // Handle AI monitoring endpoints
      if (new URL(request.url).pathname.startsWith('/api/v1/ai/monitoring')) {
        return await handleAIMonitoring(request, env, aiMonitoring);
      }
      
      // Main request handling with router
      const response = await router.handle(request, env, ctx);
      
      // Capture successful request
      if (response.status >= 200 && response.status < 400) {
        captureMessage('Request processed successfully', 'info', {
          path: new URL(request.url).pathname,
          method: request.method,
          status: response.status,
          ai_endpoint: new URL(request.url).pathname.includes('/ai/'),
        });
      }
      
      return response;
      
    } catch (error) {
      // Capture error with AI context
      Sentry.captureException(error, {
        tags: {
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
          app_section: 'ai-worker',
          user_action: 'fetch_request',
          ai_operation: request.headers.get('x-ai-operation') || 'none',
        },
        extra: {
          request_url: request.url,
          request_method: request.method,
          timestamp: new Date().toISOString(),
          ai_context: 'ai-processing-platform',
          ai_providers_available: env.OPENAI_API_KEY ? 'openai' : '' + 
                                  env.GEMINI_API_KEY ? ',gemini' : '' + 
                                  env.ANTHROPIC_API_KEY ? ',anthropic' : '',
        },
      });
      
      return new Response('Internal Server Error', { status: 500 });
    } finally {
      transaction.finish();
    }
  },
  
  // Scheduled handler for AI tasks
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (!aiMonitoring) {
      aiMonitoring = new AIMonitoring(env);
    }
    
    captureMessage('AI Scheduled task executed', 'info', {
      cron: event.cron,
      scheduledTime: event.scheduledTime,
      task: 'ai-background-processing',
    });
    
    try {
      // AI-specific scheduled tasks
      switch (event.cron) {
        case '*/5 * * * *': // Every 5 minutes - AI health checks
          await performAIHealthChecks(env, aiMonitoring);
          break;
        
        case '0 * * * *': // Every hour - AI cost analysis
          await analyzeAICosts(env, aiMonitoring);
          break;
        
        case '0 0 * * *': // Daily at midnight - AI reports
          await generateAIReports(env, aiMonitoring);
          break;
        
        case '*/15 * * * *': // Every 15 minutes - AI performance metrics
          await updateAIPerformanceMetrics(env, aiMonitoring);
          break;
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          task_type: 'ai_scheduled',
          app_feature: 'ai-monitoring',
          cron_pattern: event.cron,
        },
      });
      throw error;
    }
  },
  
  // Email handler
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await aiMonitoring.monitorAgent('email-worker', 'process-email', {
        from: message.from,
        to: Array.from(message.to).join(','),
        subject: message.headers.get('subject'),
      }, async () => {
        // Your email processing logic
        await handleEmailProcessing(message, env, aiMonitoring);
      });
    } catch (error) {
      console.error('❌ Email processing error:', error);
      aiMonitoring.captureAgentError(error, {
        agentName: 'email-worker',
        operation: 'process-email',
      });
      message.setReject('Failed to process email');
    }
  },
  
  // Queue consumer for AI processing
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`📬 Processing AI queue batch of ${batch.messages.length} messages`);
    
    for (const message of batch.messages) {
      try {
        await aiMonitoring.monitorAgent('queue-consumer', 'process-message', {
          message_id: message.id,
          queue_name: 'ai-processing',
        }, async () => {
          // Process AI message
          await processAIMessage(message, env, aiMonitoring);
          message.ack();
        });
      } catch (error) {
        console.error('Failed to process AI message:', message.id, error);
        aiMonitoring.captureAgentError(error, {
          agentName: 'queue-consumer',
          operation: 'process-message',
          messageId: message.id,
        });
        message.retry();
      }
    }
  },
});

// ============ Router Setup ============

// Create router
const router = Router<IRequest, [Env, ExecutionContext]>();

// ============ Middleware ============

// Global CORS middleware
router.all('*', handleCORS);

// Global authentication middleware (adds user to request if token exists)
router.all('/api/*', authenticate);

// AI monitoring middleware
router.all('/api/v1/ai/*', async (request, env, ctx) => {
  // Add AI monitoring context
  request.headers.set('x-ai-monitoring', env.AI_MONITORING_ENABLED || 'false');
  request.headers.set('x-ai-timestamp', Date.now().toString());
});

// ============ Routes ============

// Health check
router.get('/health', handleHealthCheck);
router.get('/api/health', handleHealthCheck);

// Static files
router.get('/assets/*', handleStaticFile);
router.get('/favicon.ico', handleStaticFile);

// API v1 Routes
const apiV1 = router.basePath('/api/v1');
router.post('/api/v1/verify', async (request, env) => {
    const verifier = new LLMVerifier(env);
    const body = await request.json();
    const result = await verifier.verify(body.content, body.options);
    return new Response(JSON.stringify(result));
});
// Auth routes
apiV1.post('/auth/register', validateRequest('register'), registerUser);
apiV1.post('/auth/login', validateRequest('login'), loginUser);
apiV1.get('/auth/me', requireAuth, getCurrentUser);
apiV1.put('/auth/profile', requireAuth, validateRequest('updateProfile'), updateUser);

// Users routes (admin only)
apiV1.get('/users', requireAdmin, listUsers);
apiV1.get('/users/:id', requireAuth, getUserById);
apiV1.put('/users/:id', requireAdmin, validateRequest('updateUser'), updateUser);

// Services routes
apiV1.get('/services', requireAuth, getServices);
apiV1.post('/services', requireAuth, validateRequest('createService'), createService);
apiV1.get('/services/:id', requireAuth, getServiceById);
apiV1.put('/services/:id', requireAuth, validateRequest('updateService'), updateService);
apiV1.delete('/services/:id', requireAuth, deleteService);

// ============ AI Routes ============

// AI Generation
apiV1.post('/ai/generate', requireAuth, validateRequest('generateAI'), 
  (request, env, ctx) => monitorAIRequest(request, env, ctx, aiMonitoring));

// AI Video Generation
apiV1.post('/ai/generate-video', requireAuth, validateRequest('generateVideo'), generateVideo);
apiV1.get('/ai/video-status/:id', requireAuth, checkVideoStatus);

// AI Image Analysis
apiV1.post('/ai/analyze-image', requireAuth, validateRequest('analyzeImage'), analyzeImage);

// AI Text Operations
apiV1.post('/ai/translate', requireAuth, validateRequest('translateText'), translateText);
apiV1.post('/ai/summarize', requireAuth, validateRequest('summarizeText'), summarizeText);
apiV1.post('/ai/analyze-text', requireAuth, validateRequest('analyzeText'), analyzeText);

// AI Information & Quota
apiV1.get('/ai/quota', requireAuth, getAIQuota);
apiV1.get('/ai/requests', requireAuth, getAIRequests);
apiV1.get('/ai/capabilities', requireAuth, getAICapabilities);
apiV1.get('/ai/providers', requireAuth, getAIProviders);
apiV1.get('/ai/usage-stats', requireAuth, getAIUsageStats);

// ============ AI Monitoring Routes (Admin Only) ============

// AI Monitoring Stats
apiV1.get('/ai/monitoring/stats', requireAdmin, getAIStats);
apiV1.get('/ai/monitoring/health', requireAdmin, getAIHealth);
apiV1.get('/ai/monitoring/alerts', requireAdmin, getAIAlerts);
apiV1.get('/ai/monitoring/metrics', requireAdmin, getAIMetrics);
apiV1.get('/ai/monitoring/llm-stats', requireAdmin, getLLMStats);

// ============ Email Routes ============

apiV1.get('/email/logs', requireAdmin, getEmailLogs);
apiV1.get('/email/config', requireAdmin, getEmailConfig);

// ============ Webhooks ============

router.post('/webhooks/email', handleEmailWebhook);
router.post('/webhooks/stripe', async (request, env) => {
  return json({ received: true });
});

// AI Webhooks
router.post('/webhooks/ai/video-completed', async (request, env) => {
  const body = await request.json();
  await aiMonitoring.logAgentMetrics('video-generation', {
    operation: 'webhook-received',
    success: body.success || false,
    metadata: body,
  });
  return json({ status: 'processed' });
});

// ============ Error Handling ============

// 404 Not Found
router.all('*', handleNotFound);

// Global error handler
const handleError = (error: any, env: Env): Response => {
  console.error('Unhandled error:', error);

  // Log error to AI monitoring
  if (aiMonitoring) {
    aiMonitoring.captureAgentError(error, {
      agentName: 'main-router',
      operation: 'request-handling',
    });
  }

  if (error.status) {
    return json(
      {
        success: false,
        error: error.message || 'An error occurred',
        code: error.code,
      },
      { status: error.status }
    );
  }

  // Internal server error
  return json(
    {
      success: false,
      error: 'Internal server error',
      message: env.ENVIRONMENT === 'development' ? error.message : undefined,
    },
    { status: 500 }
  );
};

// ============ Handler Functions ============

/**
 * Handle AI monitoring endpoints
 */
async function handleAIMonitoring(request: Request, env: Env, monitoring: AIMonitoring): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const searchParams = url.searchParams;

  try {
    switch (true) {
      case path === '/api/v1/ai/monitoring/stats': {
        const agentName = searchParams.get('agent');
        const hours = parseInt(searchParams.get('hours') || '24');
        const stats = await monitoring.getAgentStats(agentName || 'all', hours);
        return json(stats);
      }
      
      case path === '/api/v1/ai/monitoring/health': {
        const agentName = searchParams.get('agent');
        const health = await monitoring.checkAgentHealth(agentName || 'main-worker');
        return json(health);
      }
      
      case path === '/api/v1/ai/monitoring/llm-stats': {
        const provider = searchParams.get('provider');
        const hours = parseInt(searchParams.get('hours') || '24');
        const stats = await monitoring.getLLMStats(provider || 'all', hours);
        return json(stats);
      }
      
      case path === '/api/v1/ai/monitoring/alerts': {
        const resolved = searchParams.get('resolved') === 'true';
        const limit = parseInt(searchParams.get('limit') || '50');
        
        const alerts = await env.AI_MONITORING_DB.prepare(`
          SELECT * FROM performance_alerts 
          ${resolved !== undefined ? 'WHERE resolved = ?' : ''} 
          ORDER BY created_at DESC LIMIT ?
        `).bind(resolved ? 1 : 0, limit).all();
        
        return json(alerts.results);
      }
      
      case path === '/api/v1/ai/monitoring/metrics': {
        if (request.method !== 'POST') {
          return json({ error: 'Method not allowed' }, { status: 405 });
        }
        
        const data = await request.json();
        await monitoring.logAgentMetrics(data.agent, data.metrics);
        return json({ success: true });
      }
      
      default:
        return json({ error: 'Endpoint not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('AI monitoring error:', error);
    monitoring.captureAgentError(error, {
      agentName: 'ai-monitoring-handler',
      operation: path.split('/').pop() || 'unknown',
    });
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Initialize databases
 */
async function initializeDatabases(env: Env): Promise<void> {
  try {
    // Check if users table exists
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (!tables) {
      console.log('📦 Initializing main database...');
      await initializeMainDatabase(env);
    }

    // Check if AI monitoring tables exist
    const aiTables = await env.AI_MONITORING_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_agent_metrics'"
    ).first();

    if (!aiTables) {
      console.log('🤖 Initializing AI monitoring database...');
      await initializeAIMonitoringDatabase(env);
    }

    console.log('✅ All databases initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    Sentry.captureException(error);
  }
}

/**
 * Initialize main database schema
 */
async function initializeMainDatabase(env: Env): Promise<void> {
  const schema = `
    -- Your existing schema here (users, services, ai_requests, email_logs)
    -- Keep your existing schema...
    
    -- AI Models table (new)
    CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      model_type TEXT NOT NULL CHECK (model_type IN ('text', 'image', 'video', 'audio', 'multimodal')),
      capabilities TEXT NOT NULL DEFAULT '{}',
      max_tokens INTEGER,
      max_input_size INTEGER,
      supported_languages TEXT,
      cost_per_1k_tokens DECIMAL(10, 6),
      cost_per_image DECIMAL(10, 6),
      cost_per_second_video DECIMAL(10, 6),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, model_name)
    );

    -- AI Usage Analytics
    CREATE TABLE IF NOT EXISTS ai_usage_analytics (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      operation TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd DECIMAL(10, 6) DEFAULT 0,
      duration_ms INTEGER,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_usage_user (user_id, created_at),
      INDEX idx_ai_usage_provider (provider, created_at)
    );
  `;

  await env.DB.exec(schema);
}

/**
 * Initialize AI monitoring database schema
 */
async function initializeAIMonitoringDatabase(env: Env): Promise<void> {
  const schema = `
    -- AI Agent Metrics Table
    CREATE TABLE IF NOT EXISTS ai_agent_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      INDEX idx_agent_metrics_name_time (agent_name, created_at),
      INDEX idx_agent_metrics_success (success, created_at)
    );

    -- LLM Calls Table
    CREATE TABLE IF NOT EXISTS llm_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_length INTEGER NOT NULL,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      cost_usd REAL DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      response_length INTEGER DEFAULT 0,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      INDEX idx_llm_calls_provider_time (provider, created_at),
      INDEX idx_llm_calls_model (model, created_at)
    );

    -- Agent Health Table
    CREATE TABLE IF NOT EXISTS agent_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'error')),
      failure_rate INTEGER DEFAULT 0,
      avg_latency REAL,
      max_latency REAL,
      min_latency REAL,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      INDEX idx_agent_health_name_time (agent_name, checked_at)
    );

    -- AI Cost Tracking Table
    CREATE TABLE IF NOT EXISTS ai_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      cost_usd REAL NOT NULL,
      tokens_used INTEGER NOT NULL,
      user_id TEXT,
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      INDEX idx_ai_costs_provider (provider, created_at),
      INDEX idx_ai_costs_user (user_id, created_at)
    );

    -- Performance Alerts Table
    CREATE TABLE IF NOT EXISTS performance_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('latency', 'error_rate', 'cost', 'availability')),
      alert_value REAL NOT NULL,
      threshold REAL NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      message TEXT NOT NULL,
      resolved BOOLEAN DEFAULT FALSE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      INDEX idx_performance_alerts_type (alert_type, created_at),
      INDEX idx_performance_alerts_resolved (resolved, created_at)
    );
  `;

  await env.AI_MONITORING_DB.exec(schema);
}

/**
 * Process AI message from queue
 */
async function processAIMessage(message: Message, env: Env, monitoring: AIMonitoring): Promise<void> {
  const data = message.body;
  
  switch (data.type) {
    case 'text_generation':
      await processTextGeneration(data, env, monitoring);
      break;
    case 'image_analysis':
      await processImageAnalysis(data, env, monitoring);
      break;
    case 'video_generation':
      await processVideoGeneration(data, env, monitoring);
      break;
    default:
      console.warn(`Unknown AI message type: ${data.type}`);
  }
}

/**
 * Process text generation
 */
async function processTextGeneration(data: any, env: Env, monitoring: AIMonitoring): Promise<void> {
  await monitoring.monitorLLM(
    data.provider || 'openai',
    data.model || 'gpt-4',
    data.prompt,
    {
      temperature: data.temperature,
      max_tokens: data.max_tokens,
    }
  );
  
  // Your text generation logic here
  console.log('Processing text generation:', data);
}

/**
 * Process image analysis
 */
async function processImageAnalysis(data: any, env: Env, monitoring: AIMonitoring): Promise<void> {
  await monitoring.monitorAgent('image-analysis', 'process-batch', {
    image_count: data.images?.length || 0,
    provider: data.provider,
  }, async () => {
    // Your image analysis logic here
    console.log('Processing image analysis:', data);
  });
}

/**
 * Process video generation
 */
async function processVideoGeneration(data: any, env: Env, monitoring: AIMonitoring): Promise<void> {
  await monitoring.monitorAgent('video-generation', 'generate-video', {
    duration: data.duration,
    provider: data.provider,
  }, async () => {
    // Your video generation logic here
    console.log('Processing video generation:', data);
  });
}

/**
 * Handle email processing
 */
async function handleEmailProcessing(message: ForwardableEmailMessage, env: Env, monitoring: AIMonitoring): Promise<void> {
  console.log(`📧 Email received from: ${message.from}`);
  console.log(`📨 Subject: ${message.headers.get('subject')}`);

  // Parse configuration
  const allowList = env.EMAIL_ALLOWED_LIST 
    ? env.EMAIL_ALLOWED_LIST.split(',').map(e => e.trim().toLowerCase())
    : ['admin@nawthtech.com', 'support@nawthtech.com'];
  
  const forwardTo = env.EMAIL_FORWARD_TO || 'admin@nawthtech.com';
  const domain = 'nawthtech.com';

  // Check sender
  const senderEmail = message.from.toLowerCase().trim();
  let isAllowed = allowList.includes(senderEmail) || senderEmail.endsWith(`@${domain}`);

  if (!isAllowed) {
    console.log(`❌ Rejected email from: ${message.from}`);
    message.setReject('Address not allowed');
    return;
  }

  // Log to database
  try {
    await env.DB.prepare(`
      INSERT INTO email_logs (id, from_email, to_email, subject, status)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID(),
        message.from,
        Array.from(message.to).join(','),
        message.headers.get('subject') || 'No subject',
        'forwarded'
      )
      .run();
  } catch (error) {
    console.error('Failed to log email:', error);
  }

  // Forward email
  console.log(`✅ Forwarding email from ${message.from} to ${forwardTo}`);
  await message.forward(forwardTo);
}

/**
 * Perform AI health checks
 */
async function performAIHealthChecks(env: Env, monitoring: AIMonitoring): Promise<void> {
  const agents = ['text-generation', 'image-analysis', 'video-generation', 'translation'];
  
  for (const agent of agents) {
    await monitoring.checkAgentHealth(agent);
  }
}

/**
 * Analyze AI costs
 */
async function analyzeAICosts(env: Env, monitoring: AIMonitoring): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  const costs = await env.AI_MONITORING_DB.prepare(`
    SELECT provider, SUM(cost_usd) as total_cost
    FROM ai_costs
    WHERE DATE(created_at) = ?
    GROUP BY provider
  `).bind(today).all();
  
  console.log(`💰 AI costs for ${today}:`, costs.results);
  
  // Check if costs exceed threshold
  const threshold = parseFloat(env.AI_COST_ALERT_THRESHOLD || '100.00');
  const totalCost = costs.results.reduce((sum, row) => sum + (row.total_cost || 0), 0);
  
  if (totalCost > threshold) {
    await env.AI_MONITORING_DB.prepare(`
      INSERT INTO performance_alerts (agent_name, alert_type, alert_value, threshold, severity, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'system',
      'cost',
      totalCost,
      threshold,
      totalCost > threshold * 2 ? 'critical' : 'high',
      `AI costs exceeded threshold: $${totalCost.toFixed(2)} > $${threshold}`
    ).run();
  }
}

/**
 * Generate AI reports
 */
async function generateAIReports(env: Env, monitoring: AIMonitoring): Promise<void> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const report = await env.AI_MONITORING_DB.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as total_calls,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
      SUM(tokens_used) as total_tokens,
      SUM(cost_usd) as total_cost,
      AVG(execution_time_ms) as avg_latency
    FROM ai_agent_metrics
    WHERE DATE(created_at) = ?
    GROUP BY DATE(created_at)
  `).bind(yesterday).first();
  
  console.log(`📊 AI Daily Report for ${yesterday}:`, report);
  
  // Store report in analytics
  if (report) {
    await env.AI_ANALYTICS.writeDataPoint({
      blobs: ['daily_report', yesterday],
      doubles: [
        report.total_calls,
        report.successful_calls,
        report.total_tokens,
        report.total_cost,
        report.avg_latency,
      ],
    });
  }
}

/**
 * Update AI performance metrics
 */
async function updateAIPerformanceMetrics(env: Env, monitoring: AIMonitoring): Promise<void> {
  const metrics = await env.AI_MONITORING_DB.prepare(`
    SELECT 
      provider,
      model,
      AVG(latency_ms) as avg_latency,
      AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
      AVG(tokens_used) as avg_tokens,
      COUNT(*) as sample_size
    FROM llm_calls
    WHERE created_at >= datetime('now', '-1 hour')
    GROUP BY provider, model
  `).all();
  
  for (const metric of metrics.results) {
    await env.AI_MONITORING_DB.prepare(`
      INSERT INTO ai_model_performance (model_name, provider, avg_latency_ms, success_rate, avg_tokens_per_request, sample_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      metric.model,
      metric.provider,
      metric.avg_latency,
      metric.success_rate,
      metric.avg_tokens,
      metric.sample_size
    ).run();
  }
}

// ============ Helper Functions ============

// Response helper
const createResponse = (
  data: any,
  status = 200,
  headers: Record<string, string> = {}
): Response => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...defaultHeaders, ...headers },
  });
};

// Cache helper for AI responses
const cacheAIResponse = async (
  key: string,
  response: Response,
  env: Env,
  ttl = 3600
): Promise<void> => {
  try {
    await env.AI_CACHE.put(key, await response.clone().text(), {
      expirationTtl: ttl,
      metadata: {
        cachedAt: Date.now(),
        contentType: response.headers.get('content-type'),
        ai_cache: true,
      },
    });
  } catch (error) {
    console.error('AI Cache error:', error);
  }
};

// AI Rate limiting helper
const aiRateLimit = async (
  userId: string,
  endpoint: string,
  env: Env,
  limit = 100,
  window = 900
): Promise<{ allowed: boolean; remaining: number; reset: number }> => {
  const key = `ai_rate_limit:${userId}:${endpoint}`;
  const current = Date.now();
  const windowStart = current - window * 1000;

  try {
    // Get current count
    const count = parseInt((await env.AI_RATE_LIMIT.get(key)) || '0');

    // Check if exceeded
    if (count >= limit) {
      return { allowed: false, remaining: 0, reset: windowStart + window * 1000 };
    }

    // Increment count
    await env.AI_RATE_LIMIT.put(key, (count + 1).toString(), {
      expirationTtl: window,
    });

    return { allowed: true, remaining: limit - count - 1, reset: windowStart + window * 1000 };
  } catch (error) {
    console.error('AI Rate limit error:', error);
    return { allowed: true, remaining: limit, reset: current + window * 1000 };
  }
};

// Generate API documentation with AI endpoints
function generateAPIDocs(): any {
  return {
    api: {
      version: '1.0.0',
      endpoints: {
        // ... existing endpoints ...
        
        ai: {
          generation: {
            POST: '/api/v1/ai/generate',
            video: '/api/v1/ai/generate-video',
            image_analysis: '/api/v1/ai/analyze-image',
            translate: '/api/v1/ai/translate',
            summarize: '/api/v1/ai/summarize',
            analyze_text: '/api/v1/ai/analyze-text',
          },
          info: {
            quota: '/api/v1/ai/quota',
            requests: '/api/v1/ai/requests',
            capabilities: '/api/v1/ai/capabilities',
            providers: '/api/v1/ai/providers',
            usage_stats: '/api/v1/ai/usage-stats',
            video_status: '/api/v1/ai/video-status/:id',
          },
          monitoring: {
            stats: '/api/v1/ai/monitoring/stats',
            health: '/api/v1/ai/monitoring/health',
            alerts: '/api/v1/ai/monitoring/alerts',
            metrics: '/api/v1/ai/monitoring/metrics',
            llm_stats: '/api/v1/ai/monitoring/llm-stats',
          },
        },
      },
    },
  };
}