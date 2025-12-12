-- Migration: 0001_initial
-- Description: Initial database schema for NawthTech
-- Created: 2024-12-11

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator', 'provider')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'banned', 'deleted')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  deleted_at DATETIME
);

-- ============================================
-- CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image TEXT,
  description TEXT,
  parent_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ============================================
-- SERVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  duration INTEGER NOT NULL CHECK (duration > 0),
  category_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  rating REAL NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded')),
  amount REAL NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  cancelled_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  payment_method TEXT,
  transaction_id TEXT UNIQUE,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================
-- PAYMENT INTENTS TABLE (for Stripe-like flow)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requires_payment_method' CHECK (status IN ('requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded')),
  client_secret TEXT NOT NULL,
  payment_method_types TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- FILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER,
  type TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- SYSTEM LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  action TEXT NOT NULL,
  resource TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- API KEYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  last_used_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- PASSWORD RESETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- EMAIL VERIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_services_featured ON services(is_featured);
CREATE INDEX IF NOT EXISTS idx_services_created ON services(created_at);
CREATE INDEX IF NOT EXISTS idx_services_price ON services(price);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Files indexes
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);

-- System logs indexes
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_categories_timestamp 
AFTER UPDATE ON categories
BEGIN
  UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_services_timestamp 
AFTER UPDATE ON services
BEGIN
  UPDATE services SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_orders_timestamp 
AFTER UPDATE ON orders
BEGIN
  UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_payments_timestamp 
AFTER UPDATE ON payments
BEGIN
  UPDATE payments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default admin user (password: Admin@123)
INSERT OR IGNORE INTO users (
  id, email, username, password_hash, first_name, last_name, 
  role, email_verified, avatar, phone
) VALUES (
  'admin_000000000001',
  'admin@nawthtech.com',
  'admin',
  -- Hash of "Admin@123" (SHA-256)
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  'System',
  'Administrator',
  'admin',
  TRUE,
  'https://ui-avatars.com/api/?name=System+Admin&background=0D8ABC&color=fff',
  '+1234567890'
);

-- Insert default test user (password: Test@123)
INSERT OR IGNORE INTO users (
  id, email, username, password_hash, first_name, last_name,
  email_verified, avatar, phone
) VALUES (
  'user_000000000001',
  'test@nawthtech.com',
  'testuser',
  -- Hash of "Test@123" (SHA-256)
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  'Test',
  'User',
  TRUE,
  'https://ui-avatars.com/api/?name=Test+User&background=4CAF50&color=fff',
  '+1234567891'
);

-- Insert default categories
INSERT OR IGNORE INTO categories (id, name, slug, image, description) VALUES
  ('cat_000000000001', 'Web Development', 'web-development', 'https://cdn.nawthtech.com/categories/web-dev.png', 'Website and web application development services'),
  ('cat_000000000002', 'Mobile Apps', 'mobile-apps', 'https://cdn.nawthtech.com/categories/mobile.png', 'iOS and Android mobile application development'),
  ('cat_000000000003', 'Graphic Design', 'graphic-design', 'https://cdn.nawthtech.com/categories/design.png', 'Logo design, branding, and visual identity'),
  ('cat_000000000004', 'Digital Marketing', 'digital-marketing', 'https://cdn.nawthtech.com/categories/marketing.png', 'SEO, social media, and online advertising'),
  ('cat_000000000005', 'Video Editing', 'video-editing', 'https://cdn.nawthtech.com/categories/video.png', 'Video production and editing services'),
  ('cat_000000000006', 'Content Writing', 'content-writing', 'https://cdn.nawthtech.com/categories/writing.png', 'Articles, blogs, and copywriting services'),
  ('cat_000000000007', 'Consulting', 'consulting', 'https://cdn.nawthtech.com/categories/consulting.png', 'Business and technical consulting services');

-- Insert default services
INSERT OR IGNORE INTO services (
  id, title, description, price, duration, category_id, provider_id,
  images, tags, is_featured, rating, review_count
) VALUES (
  'service_000000000001',
  'Professional Website Development',
  'Create a responsive, modern website with React/Next.js, optimized for speed and SEO. Includes 3 revisions and 1 month of support.',
  499.99,
  14,
  'cat_000000000001',
  'admin_000000000001',
  '["https://cdn.nawthtech.com/services/web1.jpg","https://cdn.nawthtech.com/services/web2.jpg"]',
  '["web","react","nextjs","responsive"]',
  TRUE,
  4.8,
  24
), (
  'service_000000000002',
  'Mobile App UI/UX Design',
  'Design beautiful and user-friendly mobile app interfaces for iOS and Android. Includes wireframes, prototypes, and design system.',
  299.99,
  7,
  'cat_000000000002',
  'user_000000000001',
  '["https://cdn.nawthtech.com/services/mobile1.jpg"]',
  '["ui","ux","design","figma"]',
  TRUE,
  4.9,
  18
), (
  'service_000000000003',
  'Logo and Brand Identity',
  'Create a unique logo and complete brand identity package for your business. Includes logo variations, color palette, and typography.',
  199.99,
  5,
  'cat_000000000003',
  'admin_000000000001',
  '["https://cdn.nawthtech.com/services/logo1.jpg","https://cdn.nawthtech.com/services/logo2.jpg"]',
  '["logo","branding","identity","design"]',
  FALSE,
  4.7,
  15
);

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- View for user statistics
CREATE VIEW IF NOT EXISTS vw_user_stats AS
SELECT 
  u.id,
  u.email,
  u.username,
  u.first_name || ' ' || u.last_name as full_name,
  u.role,
  u.status,
  u.created_at,
  COALESCE(COUNT(o.id), 0) as total_orders,
  COALESCE(SUM(o.amount), 0) as total_spent,
  COALESCE(COUNT(s.id), 0) as services_offered,
  COALESCE(SUM(s.rating * s.review_count) / NULLIF(SUM(s.review_count), 0), 0) as avg_service_rating
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN services s ON u.id = s.provider_id
GROUP BY u.id;

-- View for service statistics
CREATE VIEW IF NOT EXISTS vw_service_stats AS
SELECT 
  s.id,
  s.title,
  s.price,
  c.name as category_name,
  u.first_name || ' ' || u.last_name as provider_name,
  s.rating,
  s.review_count,
  s.views,
  s.is_active,
  s.is_featured,
  s.created_at,
  COALESCE(COUNT(o.id), 0) as total_orders,
  COALESCE(SUM(o.amount), 0) as total_revenue
FROM services s
JOIN categories c ON s.category_id = c.id
JOIN users u ON s.provider_id = u.id
LEFT JOIN orders o ON s.id = o.service_id
GROUP BY s.id;

-- View for daily statistics
CREATE VIEW IF NOT EXISTS vw_daily_stats AS
SELECT 
  DATE(created_at) as date,
  COUNT(CASE WHEN role = 'user' THEN 1 END) as new_users,
  COUNT(CASE WHEN role = 'provider' THEN 1 END) as new_providers,
  COUNT(*) as new_services,
  SUM(amount) as daily_revenue
FROM (
  SELECT created_at, role, NULL as amount FROM users
  UNION ALL
  SELECT created_at, NULL as role, amount FROM orders WHERE status = 'completed'
  UNION ALL
  SELECT created_at, NULL as role, NULL as amount FROM services
)
GROUP BY DATE(created_at);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT '✅ Migration 0001_initial completed successfully! Tables created: ' || 
       GROUP_CONCAT(name, ', ') as message
FROM sqlite_master 
WHERE type = 'table' AND name NOT LIKE 'sqlite_%';