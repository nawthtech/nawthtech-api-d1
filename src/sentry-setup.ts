import * as Sentry from '@sentry/cloudflare';
import sentryConfig from '../sentry.config.js';
export { initSentry, withSentryErrorBoundary, captureMessage } from './sentry-setup.js';
export { AIMonitoring } from './monitoring/ai-agents';
export { setupSentryAI } from './monitoring/sentry-config';
// Initialize Sentry
export function initSentry(env: any) {
  Sentry.init({
    ...sentryConfig,
    environment: env.ENVIRONMENT || 'development',
    release: `nawthtech-worker@${env.VERSION || '1.0.0'}`,
  });

  // Set global user context (optional)
  Sentry.setUser({
    ip_address: '{{auto}}',
  });

  // Set global tags
  Sentry.setTag('app', 'nawthtech');
  Sentry.setTag('service', 'social-growth-platform');
  Sentry.setTag('component', 'worker');
  
  return Sentry;
}

// Error boundary wrapper for functions
export function withSentryErrorBoundary<T extends any[], R>(
  fn: (...args: T) => Promise<R> | R,
  context?: string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          function_context: context || 'unknown',
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
        },
        extra: {
          arguments: args,
          timestamp: new Date().toISOString(),
        },
      });
      
      // Re-throw the error after capturing
      throw error;
    }
  };
}

// Utility function to capture messages
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  extra?: Record<string, any>
) {
  Sentry.captureMessage(message, {
    level,
    extra: {
      ...extra,
      platform: 'cloudflare-worker',
      app: 'nawthtech',
    },
  });
}