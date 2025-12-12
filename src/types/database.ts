/**
 * Database types for D1
 */

export interface Env {
  // Bindings
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  
  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production';
  JWT_SECRET: string;
  
  // API Keys (secrets)
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  HUGGINGFACE_TOKEN?: string;
  STABILITY_API_KEY?: string;
  
  // Email
  EMAIL_FORWARD_TO?: string;
  EMAIL_ALLOWED_LIST?: string;
  EMAIL_WEBHOOK_SECRET?: string;
  
  // CORS
  ALLOWED_ORIGINS?: string;
  
  // Feature flags
  ENABLE_AI?: string;
  ENABLE_EMAIL?: string;
  
  // Queue bindings (optional)
  AI_QUEUE?: Queue;
}

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: 'user' | 'admin' | 'moderator';
  email_verified: boolean;
  quota_text_tokens: number;
  quota_images: number;
  quota_videos: number;
  quota_audio_minutes: number;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  settings: string; // JSON string
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  deleted_at?: string;
}

export interface Service {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'pending' | 'active' | 'suspended' | 'deleted';
  config: string; // JSON string
  category?: string;
  tags?: string;
  icon_url?: string;
  views: number;
  likes: number;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  deleted_at?: string;
}

export interface AIRequest {
  id: string;
  user_id: string;
  provider: 'gemini' | 'openai' | 'huggingface' | 'ollama' | 'stability';
  model: string;
  type: 'text' | 'image' | 'video' | 'audio';
  input_text?: string;
  input_tokens: number;
  output_text?: string;
  output_tokens: number;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  cost_usd: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  metadata: string; // JSON string
  created_at: string;
  completed_at?: string;
}

export interface EmailLog {
  id: string;
  from_email: string;
  to_email: string;
  subject?: string;
  message_id?: string;
  status: 'received' | 'forwarded' | 'rejected' | 'bounced';
  status_message?: string;
  headers?: string;
  body_preview?: string;
  processed_at: string;
}

// Request/Response types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
  };
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  settings?: Record<string, any>;
}

export interface CreateServiceRequest {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  config?: Record<string, any>;
}

export interface GenerateAIRequest {
  prompt: string;
  provider?: 'gemini' | 'openai' | 'huggingface';
  model?: string;
  type?: 'text' | 'image';
  options?: Record<string, any>;
}