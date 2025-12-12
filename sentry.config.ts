import * as Sentry from '@sentry/cloudflare';
import type { Options } from '@sentry/types';

/**
 * Sentry configuration for Nawthtech Social Growth Platform
 */
export const sentryConfig: Options = {
  dsn: "https://703dc8c9404510702c2c20ce3aba24d4@o4510508331892736.ingest.de.sentry.io/4510508452413520",
  
  // Environment and Release
  environment: process.env.NODE_ENV || 'development',
  release: `nawthtech-worker@${process.env.VERSION || '1.0.0'}`,
  
  // Sampling Rates
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2'),
  profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // PII and Privacy
  sendDefaultPii: true,
  maxBreadcrumbs: 50,
  
  // Debug Mode
  debug: process.env.NODE_ENV === 'development',
  
  // Integrations
  integrations: [
    new Sentry.CloudflareIntegration(),
    new Sentry.HttpIntegration({ tracing: true }),
    new Sentry.Replay(),
  ],
  
  // Initial Scope
  initialScope: {
    tags: {
      platform: 'cloudflare-workers',
      service: 'nawthtech-worker',
      app_name: 'nawthtech',
      app_type: 'social-growth-platform',
      deployment_region: process.env.CF_REGION || 'unknown',
    },
    user: {
      ip_address: '{{auto}}',
    },
  },
  
  // Before Send Hook
  beforeSend(event, hint) {
    // Filter health checks
    if (event.request?.url?.includes('/health') || event.request?.url?.includes('/ping')) {
      return null;
    }
    
    // Add Nawthtech-specific context
    event.tags = {
      ...event.tags,
      project: 'nawthtech',
      component: 'social-intelligence-worker',
      user_tier: event.request?.headers?.get('x-user-tier') || 'unknown',
    };
    
    // Add request ID for correlation
    if (event.request?.headers?.get('x-request-id')) {
      event.contexts = {
        ...event.contexts,
        trace: {
          trace_id: event.request.headers.get('x-request-id'),
          span_id: hint.eventId,
        },
      };
    }
    
    return event;
  },
  
  // Before Send Transaction
  beforeSendTransaction(event) {
    // Ignore static assets and favicon
    const ignorePaths = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];
    if (ignorePaths.some(path => event.transaction?.includes(path))) {
      return null;
    }
    
    // Add performance metrics context
    if (event.contexts?.trace) {
      event.contexts.trace = {
        ...event.contexts.trace,
        op: 'worker.fetch',
        description: `Nawthtech Worker: ${event.transaction}`,
      };
    }
    
    return event;
  },
  
  // Transport Options
  transportOptions: {
    maxConcurrentSends: 5,
    maxQueueSize: 100,
  },
};

export default sentryConfig;