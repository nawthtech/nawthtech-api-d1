// monitoring/ai-agents.js
import * as Sentry from '@sentry/cloudflare';

/**
 * AI Agent Monitoring System for Cloudflare Workers
 * Monitors AI agents, LLM calls, and performance metrics
 */

class AIMonitoring {
  constructor(env) {
    this.env = env;
    this.tags = {
      project: 'nawthtech-d1',
      environment: env.ENVIRONMENT || 'development',
      worker_version: env.WORKER_VERSION || '1.0.0',
    };
  }

  /**
   * Initialize monitoring
   */
  initialize() {
    try {
      Sentry.init({
        dsn: env.SENTRY_DSN || "https://703dc8c9404510702c2c20ce3aba24d4@o4510508331892736.ingest.de.sentry.io/4510508452413520",
        integrations: [
          Sentry.openAIIntegration({
            recordInputs: true,
            recordOutputs: true,
          }),
          Sentry.httpIntegration(),
          Sentry.contextLinesIntegration(),
        ],
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
        sendDefaultPii: true,
        debug: env.NODE_ENV === 'development',
        environment: env.ENVIRONMENT || 'development',
        beforeSend(event) {
          // Filter out sensitive data
          event = this.filterSensitiveData(event);
          return event;
        },
        beforeSendTransaction(event) {
          // Add custom tags to transactions
          event.tags = { ...event.tags, ...this.tags };
          return event;
        },
      });

      console.log('✅ AI Agent Monitoring initialized');
    } catch (error) {
      console.error('Failed to initialize monitoring:', error);
    }
  }

  /**
   * Monitor an AI agent execution
   */
  async monitorAgent(agentName, operation, context, fn) {
    const transaction = Sentry.startTransaction({
      name: `ai.agent.${agentName}.${operation}`,
      op: 'ai.agent',
      description: `${agentName} - ${operation}`,
      tags: {
        agent_name: agentName,
        agent_operation: operation,
        ...this.tags,
      },
    });

    try {
      Sentry.setContext('ai_agent_context', {
        agent: agentName,
        operation: operation,
        timestamp: new Date().toISOString(),
        ...context,
      });

      const result = await fn();
      
      transaction.setStatus('ok');
      transaction.setData('agent_result', {
        success: true,
        execution_time: transaction.endTimestamp - transaction.startTimestamp,
      });

      return result;
    } catch (error) {
      transaction.setStatus('error');
      
      Sentry.captureException(error, {
        tags: {
          agent_name: agentName,
          agent_operation: operation,
          error_type: error.name,
        },
        extra: {
          agent_context: context,
          error_stack: error.stack,
        },
      });

      throw error;
    } finally {
      transaction.finish();
    }
  }

  /**
   * Monitor an LLM API call
   */
  async monitorLLM(provider, model, prompt, options = {}) {
    const span = Sentry.startSpan({
      name: `ai.llm.${provider}.${model}`,
      op: 'ai.llm',
      description: `LLM call to ${provider} (${model})`,
      data: {
        provider,
        model,
        prompt_length: prompt?.length || 0,
        ...options,
      },
    });

    try {
      // Add LLM specific context
      Sentry.setContext('llm_call', {
        provider,
        model,
        prompt_length: prompt?.length || 0,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        timestamp: new Date().toISOString(),
      });

      // Log the call to D1
      await this.logLLMCall({
        provider,
        model,
        prompt_length: prompt?.length || 0,
        success: true,
        timestamp: new Date().toISOString(),
      });

      span.setStatus('ok');
    } catch (error) {
      span.setStatus('error');
      
      // Log error to D1
      await this.logLLMCall({
        provider,
        model,
        prompt_length: prompt?.length || 0,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      throw error;
    } finally {
      span.finish();
    }
  }

  /**
   * Log AI agent metrics to D1
   */
  async logAgentMetrics(agentName, metrics) {
    try {
      await this.env.DB.prepare(`
        INSERT INTO ai_agent_metrics (
          agent_name,
          operation,
          execution_time_ms,
          tokens_used,
          cost_usd,
          success,
          error_message,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        agentName,
        metrics.operation || 'unknown',
        metrics.execution_time || 0,
        metrics.tokens_used || 0,
        metrics.cost_usd || 0,
        metrics.success ? 1 : 0,
        metrics.error_message || null,
        JSON.stringify(metrics.metadata || {}),
        new Date().toISOString()
      ).run();
    } catch (error) {
      console.error('Failed to log agent metrics:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Log LLM call to D1
   */
  async logLLMCall(callData) {
    try {
      await this.env.DB.prepare(`
        INSERT INTO llm_calls (
          provider,
          model,
          prompt_length,
          success,
          error_message,
          cost_usd,
          tokens_used,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        callData.provider,
        callData.model,
        callData.prompt_length,
        callData.success ? 1 : 0,
        callData.error || null,
        callData.cost_usd || 0,
        callData.tokens_used || 0,
        callData.timestamp
      ).run();
    } catch (error) {
      console.error('Failed to log LLM call:', error);
      Sentry.captureException(error);
    }
  }

  /**
   * Get AI agent performance statistics
   */
  async getAgentStats(agentName, hours = 24) {
    try {
      const stats = await this.env.DB.prepare(`
        SELECT 
          COUNT(*) as total_calls,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
          AVG(execution_time_ms) as avg_execution_time,
          SUM(tokens_used) as total_tokens,
          SUM(cost_usd) as total_cost,
          MIN(created_at) as first_call,
          MAX(created_at) as last_call
        FROM ai_agent_metrics
        WHERE agent_name = ? 
          AND created_at >= datetime('now', ?)
      `).bind(agentName, `-${hours} hours`).first();

      return stats;
    } catch (error) {
      console.error('Failed to get agent stats:', error);
      Sentry.captureException(error);
      return null;
    }
  }

  /**
   * Get LLM provider statistics
   */
  async getLLMStats(provider, hours = 24) {
    try {
      const stats = await this.env.DB.prepare(`
        SELECT 
          COUNT(*) as total_calls,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_calls,
          AVG(prompt_length) as avg_prompt_length,
          SUM(tokens_used) as total_tokens,
          SUM(cost_usd) as total_cost,
          model,
          COUNT(DISTINCT model) as models_used
        FROM llm_calls
        WHERE provider = ? 
          AND created_at >= datetime('now', ?)
        GROUP BY model
      `).bind(provider, `-${hours} hours`).all();

      return stats.results;
    } catch (error) {
      console.error('Failed to get LLM stats:', error);
      Sentry.captureException(error);
      return [];
    }
  }

  /**
   * Monitor AI agent health
   */
  async checkAgentHealth(agentName) {
    const healthCheck = Sentry.startSpan({
      name: `ai.agent.${agentName}.health_check`,
      op: 'ai.agent.health',
    });

    try {
      // Get recent failures
      const recentFailures = await this.env.DB.prepare(`
        SELECT COUNT(*) as failure_count
        FROM ai_agent_metrics
        WHERE agent_name = ? 
          AND success = 0 
          AND created_at >= datetime('now', '-1 hour')
      `).bind(agentName).first();

      // Get latency stats
      const latencyStats = await this.env.DB.prepare(`
        SELECT 
          AVG(execution_time_ms) as avg_latency,
          MAX(execution_time_ms) as max_latency,
          MIN(execution_time_ms) as min_latency
        FROM ai_agent_metrics
        WHERE agent_name = ? 
          AND created_at >= datetime('now', '-1 hour')
      `).bind(agentName).first();

      const health = {
        status: recentFailures.failure_count > 10 ? 'degraded' : 'healthy',
        failure_rate: recentFailures.failure_count,
        latency: {
          avg: latencyStats.avg_latency,
          max: latencyStats.max_latency,
          min: latencyStats.min_latency,
        },
        last_check: new Date().toISOString(),
      };

      // Log health status
      await this.logHealthStatus(agentName, health);

      healthCheck.setData('health_status', health);
      healthCheck.setStatus(health.status === 'healthy' ? 'ok' : 'error');

      return health;
    } catch (error) {
      healthCheck.setStatus('error');
      Sentry.captureException(error);
      return { status: 'error', message: error.message };
    } finally {
      healthCheck.finish();
    }
  }

  /**
   * Log health status to D1
   */
  async logHealthStatus(agentName, health) {
    try {
      await this.env.DB.prepare(`
        INSERT INTO agent_health (
          agent_name,
          status,
          failure_rate,
          avg_latency,
          max_latency,
          min_latency,
          checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        agentName,
        health.status,
        health.failure_rate,
        health.latency.avg,
        health.latency.max,
        health.latency.min,
        new Date().toISOString()
      ).run();
    } catch (error) {
      console.error('Failed to log health status:', error);
    }
  }

  /**
   * Filter sensitive data from Sentry events
   */
  filterSensitiveData(event) {
    // Remove API keys and sensitive tokens
    if (event.request && event.request.headers) {
      const sensitiveHeaders = ['authorization', 'x-api-key', 'api-key', 'token'];
      sensitiveHeaders.forEach(header => {
        if (event.request.headers[header]) {
          event.request.headers[header] = '[FILTERED]';
        }
      });
    }

    // Filter sensitive data from extra context
    if (event.extra) {
      const sensitiveFields = ['api_key', 'token', 'password', 'secret'];
      sensitiveFields.forEach(field => {
        if (event.extra[field]) {
          event.extra[field] = '[FILTERED]';
        }
      });
    }

    return event;
  }

  /**
   * Custom error handler for AI agents
   */
  captureAgentError(error, context = {}) {
    Sentry.captureException(error, {
      tags: {
        error_source: 'ai_agent',
        agent_name: context.agentName,
        operation: context.operation,
      },
      extra: {
        agent_context: context,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Performance monitoring wrapper
   */
  performanceMonitor(name, fn) {
    return async (...args) => {
      const span = Sentry.startSpan({
        name: `performance.${name}`,
        op: 'performance',
      });

      try {
        const result = await fn(...args);
        span.setStatus('ok');
        return result;
      } catch (error) {
        span.setStatus('error');
        throw error;
      } finally {
        span.finish();
      }
    };
  }
}

export default AIMonitoring;