-- Database schema for NawthTech
-- Run with: wrangler d1 execute nawthtech-db --file=./schema.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'moderator')),
  email_verified BOOLEAN DEFAULT FALSE,
  quota_text_tokens INTEGER DEFAULT 10000,
  quota_images INTEGER DEFAULT 10,
  quota_videos INTEGER DEFAULT 3,
  quota_audio_minutes INTEGER DEFAULT 30,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'suspended', 'deleted')),
  config TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- AI Requests table
CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'received',
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Agent Monitoring Database Schema

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
  metadata TEXT, -- JSON string
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL
);

-- Agent Health Table
CREATE TABLE IF NOT EXISTS agent_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'healthy', 'degraded', 'error'
  failure_rate INTEGER DEFAULT 0,
  avg_latency REAL,
  max_latency REAL,
  min_latency REAL,
  checked_at TEXT NOT NULL
);

-- Performance Alerts Table
CREATE TABLE IF NOT EXISTS performance_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'latency', 'error_rate', 'cost'
  alert_value REAL NOT NULL,
  threshold REAL NOT NULL,
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agent_metrics_name_time ON ai_agent_metrics(agent_name, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_success ON ai_agent_metrics(success, created_at);
CREATE INDEX IF NOT EXISTS idx_llm_calls_provider_time ON llm_calls(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_health_name_time ON agent_health(agent_name, checked_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id ON ai_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_processed_at ON email_logs(processed_at);

-- Insert admin user (password: admin123 - change in production!)
INSERT OR IGNORE INTO users (id, email, username, password_hash, role, email_verified)
VALUES (
  'admin-001',
  'admin@nawthtech.com',
  'admin',
  -- hash of 'admin123'
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'admin',
  TRUE
);