import * as Sentry from '@sentry/cloudflare';
import { sentryConfig } from '../../sentry.config';

// Types for Nawthtech-specific Sentry data
export interface NawthtechSentryContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  feature?: 'ai' | 'social' | 'growth' | 'analytics' | 'video';
  tier?: 'free' | 'pro' | 'enterprise';
}

export interface SentryErrorMetadata {
  component: string;
  feature?: string;
  userAction?: string;
  additionalContext?: Record<string, unknown>;
}

/**
 * Initialize Sentry with Nawthtech configuration
 */
export function initNawthtechSentry(env: Record<string, unknown>): void {
  Sentry.init({
    ...sentryConfig,
    environment: (env.ENVIRONMENT as string) || 'development',
    release: `nawthtech@${(env.VERSION as string) || '1.0.0'}`,
    dsn: (env.SENTRY_DSN as string) || sentryConfig.dsn,
  });

  // Set global Nawthtech context
  Sentry.setTag('app', 'nawthtech-social-platform');
  Sentry.setTag('deployment', 'cloudflare-workers');
  Sentry.setTag('region', (env.CF_REGION as string) || 'auto');
}

/**
 * Wrap a function with Sentry error boundary
 */
export function withSentryBoundary<T extends any[], R>(
  fn: (...args: T) => Promise<R> | R,
  metadata?: SentryErrorMetadata
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const transaction = Sentry.startTransaction({
      name: `function:${fn.name || 'anonymous'}`,
      op: 'function',
      description: metadata?.component || 'unknown',
    });

    Sentry.configureScope(scope => {
      scope.setSpan(transaction);
      
      if (metadata) {
        scope.setTag('component', metadata.component);
        if (metadata.feature) scope.setTag('feature', metadata.feature);
        if (metadata.userAction) scope.setTag('user_action', metadata.userAction);
        
        if (metadata.additionalContext) {
          Object.entries(metadata.additionalContext).forEach(([key, value]) => {
            scope.setExtra(key, value);
          });
        }
      }
    });

    try {
      const result = await fn(...args);
      transaction.setStatus('ok');
      return result;
    } catch (error) {
      transaction.setStatus('internal_error');
      
      Sentry.captureException(error, {
        tags: {
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
          ...metadata,
        },
        extra: {
          arguments: args.length > 0 ? JSON.stringify(args) : 'none',
          timestamp: new Date().toISOString(),
          nawthtech_platform: 'social-intelligence',
        },
      });
      
      throw error;
    } finally {
      transaction.finish();
    }
  };
}

/**
 * Capture a message with Nawthtech context
 */
export function captureNawthtechMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: NawthtechSentryContext
): void {
  Sentry.captureMessage(message, {
    level,
    tags: {
      app_section: 'social-growth-worker',
      ...(context?.feature && { feature: context.feature }),
      ...(context?.tier && { user_tier: context.tier }),
    },
    extra: {
      ...context,
      platform: 'nawthtech-cloudflare',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Set user context for Nawthtech
 */
export function setNawthtechUser(userId: string, traits?: Record<string, unknown>): void {
  Sentry.setUser({
    id: userId,
    ip_address: '{{auto}}',
    ...traits,
  });
}

/**
 * Create a Sentry transaction for monitoring
 */
export function startNawthtechTransaction(
  name: string,
  op: string,
  context?: Partial<Sentry.TransactionContext>
): Sentry.Transaction {
  return Sentry.startTransaction({
    name,
    op,
    tags: {
      platform: 'nawthtech-worker',
      service: 'social-growth',
      ...context?.tags,
    },
    ...context,
  });
}

/**
 * Test function to verify Sentry integration
 */
export function triggerSentryTest(): void {
  setTimeout(() => {
    try {
      throw new Error('[Nawthtech Test] Sentry integration verification - Social Growth Platform');
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          test: 'integration-verification',
          platform: 'nawthtech-test',
          purpose: 'sentry-setup-validation',
        },
        extra: {
          test_timestamp: new Date().toISOString(),
          app_version: '1.0.0',
          test_environment: 'development',
        },
      });
    }
  }, 100);
}