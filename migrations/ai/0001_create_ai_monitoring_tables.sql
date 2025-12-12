-- migrations/ai/0001_create_ai_monitoring_tables.sql

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    -- Indexes for better query performance
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

-- AI Feature Usage Table
CREATE TABLE IF NOT EXISTS ai_feature_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_name TEXT NOT NULL,
    user_id TEXT,
    usage_count INTEGER DEFAULT 1,
    last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    INDEX idx_ai_feature_usage_feature (feature_name, last_used_at),
    INDEX idx_ai_feature_usage_user (user_id, feature_name)
);

-- AI Rate Limit Table
CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    
    UNIQUE(user_id, endpoint, period_start),
    INDEX idx_ai_rate_limits_user (user_id, endpoint)
);

-- AI Model Performance Table
CREATE TABLE IF NOT EXISTS ai_model_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    avg_latency_ms REAL,
    success_rate REAL,
    avg_tokens_per_request REAL,
    sample_size INTEGER,
    measured_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    INDEX idx_ai_model_performance_model (model_name, measured_at)
);