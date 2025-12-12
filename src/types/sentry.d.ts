declare global {
  interface Env {
    SENTRY_DSN?: string;
    SENTRY_ENVIRONMENT?: string;
    SENTRY_RELEASE?: string;
    ENABLE_SENTRY?: string;
  }
  
  interface ExecutionContext {
    sentryTrace?: string;
    sentryBaggage?: string;
  }
}

export {};

// Sentry-specific type extensions
export interface SentryEventContext {
  app: 'nawthtech';
  service: 'social-growth-platform';
  user_id?: string;
  session_id?: string;
  request_id?: string;
}

export interface SentryCustomTags {
  platform: 'cloudflare-workers';
  component: 'worker' | 'api' | 'email' | 'video';
  feature: 'ai' | 'social' | 'growth' | 'analytics';
  user_tier?: 'free' | 'pro' | 'enterprise';
}