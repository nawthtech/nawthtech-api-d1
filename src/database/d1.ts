import type { Env } from '../index';

// ============================================
// Database Types
// ============================================

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'admin' | 'moderator' | 'provider';
  status: 'active' | 'inactive' | 'suspended' | 'banned' | 'deleted';
  email_verified: boolean;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_login?: string;
  deleted_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string;
  description?: string;
  parent_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: number;
  duration: number;
  category_id: string;
  provider_id: string;
  images: string[];
  tags: string[];
  is_active: boolean;
  is_featured: boolean;
  rating: number;
  review_count: number;
  views: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Order {
  id: string;
  user_id: string;
  service_id: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'refunded';
  amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  cancelled_at?: string;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  payment_method?: string;
  transaction_id?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface PaymentIntent {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  client_secret: string;
  payment_method_types: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
  read_at?: string;
}

export interface File {
  id: string;
  user_id: string;
  name: string;
  url: string;
  size?: number;
  type?: string;
  metadata: Record<string, any>;
  created_at: string;
  deleted_at?: string;
}

export interface SystemLog {
  id: string;
  user_id?: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  action: string;
  resource?: string;
  details?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  permissions: string[];
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
  revoked_at?: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  user_agent?: string;
  ip_address?: string;
  expires_at: string;
  created_at: string;
  last_accessed_at: string;
}

export interface PasswordReset {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface EmailVerification {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  verified_at?: string;
  created_at: string;
}

// ============================================
// Query Result Types
// ============================================

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

// ============================================
// Database Service
// ============================================

export class DatabaseService {
  constructor(private env: Env) {}

  // ============ Helper Methods ============
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseJSON<T>(json: string | null): T {
    if (!json) return {} as T;
    try {
      return JSON.parse(json);
    } catch {
      return {} as T;
    }
  }

  private stringifyJSON(data: any): string | null {
    if (!data) return null;
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }

  private buildWhereClause(filters: Record<string, any>): {
    where: string;
    values: any[];
  } {
    const conditions: string[] = [];
    const values: any[] = [];

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key.endsWith('_like')) {
          const field = key.replace('_like', '');
          conditions.push(`${field} LIKE ?`);
          values.push(`%${value}%`);
        } else if (key.endsWith('_gt')) {
          const field = key.replace('_gt', '');
          conditions.push(`${field} > ?`);
          values.push(value);
        } else if (key.endsWith('_lt')) {
          const field = key.replace('_lt', '');
          conditions.push(`${field} < ?`);
          values.push(value);
        } else if (key.endsWith('_in')) {
          const field = key.replace('_in', '');
          const placeholders = Array.isArray(value) 
            ? value.map(() => '?').join(',')
            : '?';
          conditions.push(`${field} IN (${placeholders})`);
          if (Array.isArray(value)) {
            values.push(...value);
          } else {
            values.push(value);
          }
        } else {
          conditions.push(`${key} = ?`);
          values.push(value);
        }
      }
    });

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      values
    };
  }

  private buildPagination(page: number = 1, limit: number = 10): {
    offset: number;
    limit: number;
  } {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    return {
      offset: (safePage - 1) * safeLimit,
      limit: safeLimit
    };
  }

  // ============ Users ============

  async createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const id = this.generateId('user');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO users (
        id, email, username, password_hash, first_name, last_name, 
        phone, avatar, role, status, email_verified, settings, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        user.email,
        user.username,
        user.password_hash,
        user.first_name,
        user.last_name,
        user.phone || null,
        user.avatar || null,
        user.role || 'user',
        user.status || 'active',
        user.email_verified ? 1 : 0,
        this.stringifyJSON(user.settings) || '{}',
        now,
        now
      )
      .first<User>();

    return this.mapUser(result);
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM users WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first();

    return result ? this.mapUser(result) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM users WHERE email = ? AND deleted_at IS NULL
    `).bind(email).first();

    return result ? this.mapUser(result) : null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM users WHERE username = ? AND deleted_at IS NULL
    `).bind(username).first();

    return result ? this.mapUser(result) : null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    const now = new Date().toISOString();

    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }
    if (updates.username !== undefined) {
      setClauses.push('username = ?');
      values.push(updates.username);
    }
    if (updates.first_name !== undefined) {
      setClauses.push('first_name = ?');
      values.push(updates.first_name);
    }
    if (updates.last_name !== undefined) {
      setClauses.push('last_name = ?');
      values.push(updates.last_name);
    }
    if (updates.phone !== undefined) {
      setClauses.push('phone = ?');
      values.push(updates.phone || null);
    }
    if (updates.avatar !== undefined) {
      setClauses.push('avatar = ?');
      values.push(updates.avatar || null);
    }
    if (updates.role !== undefined) {
      setClauses.push('role = ?');
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.email_verified !== undefined) {
      setClauses.push('email_verified = ?');
      values.push(updates.email_verified ? 1 : 0);
    }
    if (updates.last_login !== undefined) {
      setClauses.push('last_login = ?');
      values.push(updates.last_login || null);
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?');
      values.push(this.stringifyJSON(updates.settings) || '{}');
    }

    setClauses.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const result = await this.env.DB.prepare(`
      UPDATE users 
      SET ${setClauses.join(', ')} 
      WHERE id = ? AND deleted_at IS NULL
      RETURNING *
    `).bind(...values).first();

    return result ? this.mapUser(result) : null;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(`
      UPDATE users 
      SET status = 'deleted', deleted_at = ?, updated_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), new Date().toISOString(), id)
      .run();

    return result.success;
  }

  async getUsers(filters: QueryOptions & Partial<User>): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause(filterFields);
    const whereClause = where.where ? `${where.where} AND deleted_at IS NULL` : 'WHERE deleted_at IS NULL';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM users 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapUser),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      password_hash: row.password_hash,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      avatar: row.avatar,
      role: row.role,
      status: row.status,
      email_verified: Boolean(row.email_verified),
      settings: this.parseJSON(row.settings),
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login: row.last_login,
      deleted_at: row.deleted_at
    };
  }

  // ============ Categories ============

  async createCategory(category: Omit<Category, 'id' | 'created_at' | 'updated_at'>): Promise<Category> {
    const id = this.generateId('cat');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO categories (
        id, name, slug, image, description, parent_id, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        category.name,
        category.slug,
        category.image || null,
        category.description || null,
        category.parent_id || null,
        category.is_active ? 1 : 0,
        now,
        now
      )
      .first<Category>();

    return this.mapCategory(result);
  }

  async getCategoryById(id: string): Promise<Category | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM categories WHERE id = ?
    `).bind(id).first();

    return result ? this.mapCategory(result) : null;
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM categories WHERE slug = ?
    `).bind(slug).first();

    return result ? this.mapCategory(result) : null;
  }

  async getCategories(filters: QueryOptions & Partial<Category>): Promise<PaginatedResult<Category>> {
    const { page = 1, limit = 10, sortBy = 'name', sortOrder = 'ASC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause(filterFields);
    const whereClause = where.where || '';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM categories ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM categories 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapCategory),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  private mapCategory(row: any): Category {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      image: row.image,
      description: row.description,
      parent_id: row.parent_id,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // ============ Services ============

  async createService(service: Omit<Service, 'id' | 'created_at' | 'updated_at' | 'views'>): Promise<Service> {
    const id = this.generateId('service');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO services (
        id, title, description, price, duration, category_id, provider_id,
        images, tags, is_active, is_featured, rating, review_count, views,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        service.title,
        service.description,
        service.price,
        service.duration,
        service.category_id,
        service.provider_id,
        this.stringifyJSON(service.images) || '[]',
        this.stringifyJSON(service.tags) || '[]',
        service.is_active ? 1 : 0,
        service.is_featured ? 1 : 0,
        service.rating || 0,
        service.review_count || 0,
        0, // initial views
        now,
        now
      )
      .first<Service>();

    return this.mapService(result);
  }

  async getServiceById(id: string): Promise<Service | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM services WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first();

    return result ? this.mapService(result) : null;
  }

  async getServices(filters: QueryOptions & Partial<Service>): Promise<PaginatedResult<Service>> {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause(filterFields);
    const whereClause = where.where ? `${where.where} AND deleted_at IS NULL` : 'WHERE deleted_at IS NULL';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM services ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM services 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapService),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  async searchServices(query: string, filters: QueryOptions & Partial<Service>): Promise<PaginatedResult<Service>> {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause(filterFields);
    const searchConditions = [
      'title LIKE ?',
      'description LIKE ?',
      'tags LIKE ?'
    ];
    const searchValues = [`%${query}%`, `%${query}%`, `%${query}%`];
    
    const whereClause = [
      where.where ? where.where.replace('WHERE ', '') : '',
      ...searchConditions
    ].filter(Boolean).join(' AND ');
    
    const finalWhereClause = whereClause 
      ? `WHERE ${whereClause} AND deleted_at IS NULL`
      : 'WHERE deleted_at IS NULL';
    
    const allValues = [...where.values, ...searchValues];
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM services ${finalWhereClause}
    `).bind(...allValues).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM services 
      ${finalWhereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...allValues, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapService),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  async incrementServiceViews(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE services SET views = views + 1 WHERE id = ?
    `).bind(id).run();
  }

  private mapService(row: any): Service {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      duration: row.duration,
      category_id: row.category_id,
      provider_id: row.provider_id,
      images: this.parseJSON<string[]>(row.images),
      tags: this.parseJSON<string[]>(row.tags),
      is_active: Boolean(row.is_active),
      is_featured: Boolean(row.is_featured),
      rating: row.rating,
      review_count: row.review_count,
      views: row.views,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at
    };
  }

  // ============ Orders ============

  async createOrder(order: Omit<Order, 'id' | 'created_at' | 'updated_at'>): Promise<Order> {
    const id = this.generateId('order');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO orders (
        id, user_id, service_id, status, amount, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        order.user_id,
        order.service_id,
        order.status || 'pending',
        order.amount,
        order.notes || null,
        now,
        now
      )
      .first<Order>();

    return this.mapOrder(result);
  }

  async getOrderById(id: string): Promise<Order | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).bind(id).first();

    return result ? this.mapOrder(result) : null;
  }

  async getOrdersByUserId(userId: string, filters: QueryOptions & Partial<Order>): Promise<PaginatedResult<Order>> {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause({ ...filterFields, user_id: userId });
    const whereClause = where.where || '';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM orders ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM orders 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapOrder),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  async updateOrderStatus(id: string, status: Order['status'], notes?: string): Promise<Order | null> {
    const now = new Date().toISOString();
    let updateFields = 'status = ?, updated_at = ?';
    const values: any[] = [status, now];
    
    if (notes) {
      updateFields += ', notes = COALESCE(?, notes)';
      values.push(notes);
    }
    
    if (status === 'completed') {
      updateFields += ', completed_at = ?';
      values.push(now);
    } else if (status === 'cancelled') {
      updateFields += ', cancelled_at = ?';
      values.push(now);
    }
    
    values.push(id);
    
    const result = await this.env.DB.prepare(`
      UPDATE orders 
      SET ${updateFields}
      WHERE id = ?
      RETURNING *
    `).bind(...values).first();

    return result ? this.mapOrder(result) : null;
  }

  private mapOrder(row: any): Order {
    return {
      id: row.id,
      user_id: row.user_id,
      service_id: row.service_id,
      status: row.status,
      amount: row.amount,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at
    };
  }

  // ============ Payments ============

  async createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    const id = this.generateId('pay');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO payments (
        id, order_id, amount, currency, status, payment_method, transaction_id,
        metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        payment.order_id,
        payment.amount,
        payment.currency || 'USD',
        payment.status || 'pending',
        payment.payment_method || null,
        payment.transaction_id || null,
        this.stringifyJSON(payment.metadata) || '{}',
        now,
        now
      )
      .first<Payment>();

    return this.mapPayment(result);
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM payments WHERE id = ?
    `).bind(id).first();

    return result ? this.mapPayment(result) : null;
  }

  async updatePaymentStatus(id: string, status: Payment['status'], transactionId?: string): Promise<Payment | null> {
    const now = new Date().toISOString();
    let updateFields = 'status = ?, updated_at = ?';
    const values: any[] = [status, now];
    
    if (transactionId) {
      updateFields += ', transaction_id = ?';
      values.push(transactionId);
    }
    
    if (status === 'completed' || status === 'refunded') {
      updateFields += ', completed_at = ?';
      values.push(now);
    }
    
    values.push(id);
    
    const result = await this.env.DB.prepare(`
      UPDATE payments 
      SET ${updateFields}
      WHERE id = ?
      RETURNING *
    `).bind(...values).first();

    return result ? this.mapPayment(result) : null;
  }

  private mapPayment(row: any): Payment {
    return {
      id: row.id,
      order_id: row.order_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      payment_method: row.payment_method,
      transaction_id: row.transaction_id,
      metadata: this.parseJSON(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at
    };
  }

  // ============ Payment Intents ============

  async createPaymentIntent(paymentIntent: Omit<PaymentIntent, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentIntent> {
    const id = this.generateId('pi');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO payment_intents (
        id, order_id, amount, currency, status, client_secret, payment_method_types,
        metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        paymentIntent.order_id,
        paymentIntent.amount,
        paymentIntent.currency,
        paymentIntent.status || 'requires_payment_method',
        paymentIntent.client_secret,
        this.stringifyJSON(paymentIntent.payment_method_types) || '[]',
        this.stringifyJSON(paymentIntent.metadata) || '{}',
        now,
        now
      )
      .first<PaymentIntent>();

    return this.mapPaymentIntent(result);
  }

  async getPaymentIntentById(id: string): Promise<PaymentIntent | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM payment_intents WHERE id = ?
    `).bind(id).first();

    return result ? this.mapPaymentIntent(result) : null;
  }

  async updatePaymentIntentStatus(id: string, status: PaymentIntent['status']): Promise<PaymentIntent | null> {
    const result = await this.env.DB.prepare(`
      UPDATE payment_intents 
      SET status = ?, updated_at = ?
      WHERE id = ?
      RETURNING *
    `)
      .bind(status, new Date().toISOString(), id)
      .first();

    return result ? this.mapPaymentIntent(result) : null;
  }

  private mapPaymentIntent(row: any): PaymentIntent {
    return {
      id: row.id,
      order_id: row.order_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      client_secret: row.client_secret,
      payment_method_types: this.parseJSON<string[]>(row.payment_method_types),
      metadata: this.parseJSON(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // ============ Notifications ============

  async createNotification(notification: Omit<Notification, 'id' | 'created_at'>): Promise<Notification> {
    const id = this.generateId('notif');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO notifications (
        id, user_id, title, message, type, is_read, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        notification.user_id,
        notification.title,
        notification.message,
        notification.type || 'info',
        notification.is_read ? 1 : 0,
        this.stringifyJSON(notification.metadata) || '{}',
        now
      )
      .first<Notification>();

    return this.mapNotification(result);
  }

  async getUserNotifications(userId: string, filters: QueryOptions & Partial<Notification>): Promise<PaginatedResult<Notification>> {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause({ ...filterFields, user_id: userId });
    const whereClause = where.where || '';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM notifications ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM notifications 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapNotification),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = ? 
      WHERE user_id = ? AND is_read = 0
    `)
      .bind(new Date().toISOString(), userId)
      .run();
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND is_read = 0
    `).bind(userId).first<{ count: number }>();

    return result?.count || 0;
  }

  private mapNotification(row: any): Notification {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      is_read: Boolean(row.is_read),
      metadata: this.parseJSON(row.metadata),
      created_at: row.created_at,
      read_at: row.read_at
    };
  }

  // ============ Files ============

  async createFile(file: Omit<File, 'id' | 'created_at'>): Promise<File> {
    const id = this.generateId('file');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO files (
        id, user_id, name, url, size, type, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        file.user_id,
        file.name,
        file.url,
        file.size || null,
        file.type || null,
        this.stringifyJSON(file.metadata) || '{}',
        now
      )
      .first<File>();

    return this.mapFile(result);
  }

  async getFileById(id: string): Promise<File | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM files WHERE id = ? AND deleted_at IS NULL
    `).bind(id).first();

    return result ? this.mapFile(result) : null;
  }

  async getUserFiles(userId: string): Promise<File[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM files 
      WHERE user_id = ? AND deleted_at IS NULL 
      ORDER BY created_at DESC
    `).bind(userId).all();

    return result.results.map(this.mapFile);
  }

  async deleteFile(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(`
      UPDATE files
      SET deleted_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();

    return result.success;
  }

  private mapFile(row: any): File {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      url: row.url,
      size: row.size,
      type: row.type,
      metadata: this.parseJSON(row.metadata),
      created_at: row.created_at,
      deleted_at: row.deleted_at
    };
  }

  // ============ System Logs ============

  async createSystemLog(log: Omit<SystemLog, 'id' | 'created_at'>): Promise<SystemLog> {
    const id = this.generateId('log');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO system_logs (
        id, user_id, level, action, resource, details, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        log.user_id || null,
        log.level,
        log.action,
        log.resource || null,
        log.details || null,
        log.ip_address || null,
        log.user_agent || null,
        now
      )
      .first<SystemLog>();

    return this.mapSystemLog(result);
  }

  async getSystemLogs(filters: QueryOptions & Partial<SystemLog>): Promise<PaginatedResult<SystemLog>> {
    const { page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'DESC', ...filterFields } = filters;
    const { offset, limit: safeLimit } = this.buildPagination(page, limit);
    
    const where = this.buildWhereClause(filterFields);
    const whereClause = where.where || '';
    
    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as total FROM system_logs ${whereClause}
    `).bind(...where.values).first<{ total: number }>();
    
    const total = countResult?.total || 0;
    
    // Get paginated data
    const result = await this.env.DB.prepare(`
      SELECT * FROM system_logs 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...where.values, safeLimit, offset).all();
    
    return {
      data: result.results.map(this.mapSystemLog),
      total,
      page,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit)
    };
  }

  async cleanOldLogs(days: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    await this.env.DB.prepare(`
      DELETE FROM system_logs WHERE created_at < ?
    `).bind(cutoffDate.toISOString()).run();
  }

  private mapSystemLog(row: any): SystemLog {
    return {
      id: row.id,
      user_id: row.user_id,
      level: row.level,
      action: row.action,
      resource: row.resource,
      details: row.details,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at
    };
  }

  // ============ API Keys ============

  async createApiKey(apiKey: Omit<ApiKey, 'id' | 'created_at'>): Promise<ApiKey> {
    const id = this.generateId('api');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO api_keys (
        id, user_id, name, key_hash, prefix, permissions, last_used_at, expires_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        apiKey.user_id,
        apiKey.name,
        apiKey.key_hash,
        apiKey.prefix,
        this.stringifyJSON(apiKey.permissions) || '[]',
        apiKey.last_used_at || null,
        apiKey.expires_at || null,
        now,
        apiKey.revoked_at || null
      )
      .first<ApiKey>();

    return this.mapApiKey(result);
  }

  async getApiKeyById(id: string): Promise<ApiKey | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM api_keys WHERE id = ?
    `).bind(id).first();

    return result ? this.mapApiKey(result) : null;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
    `).bind(keyHash).first();

    return result ? this.mapApiKey(result) : null;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE api_keys 
      SET last_used_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(`
      UPDATE api_keys 
      SET revoked_at = ? 
      WHERE id = ? AND revoked_at IS NULL
    `)
      .bind(new Date().toISOString(), id)
      .run();

    return result.success;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM api_keys 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).bind(userId).all();

    return result.results.map(this.mapApiKey);
  }

  async getValidApiKeys(): Promise<ApiKey[]> {
    const now = new Date().toISOString();
    const result = await this.env.DB.prepare(`
      SELECT * FROM api_keys 
      WHERE revoked_at IS NULL 
      AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `).bind(now).all();

    return result.results.map(this.mapApiKey);
  }

  private mapApiKey(row: any): ApiKey {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      key_hash: row.key_hash,
      prefix: row.prefix,
      permissions: this.parseJSON<string[]>(row.permissions),
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
      revoked_at: row.revoked_at
    };
  }

  // ============ Sessions ============

  async createSession(session: Omit<Session, 'id' | 'created_at' | 'last_accessed_at'>): Promise<Session> {
    const id = this.generateId('sess');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO sessions (
        id, user_id, token, user_agent, ip_address, expires_at, created_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        session.user_id,
        session.token,
        session.user_agent || null,
        session.ip_address || null,
        session.expires_at,
        now,
        now
      )
      .first<Session>();

    return this.mapSession(result);
  }

  async getSessionById(id: string): Promise<Session | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).bind(id).first();

    return result ? this.mapSession(result) : null;
  }

  async getSessionByToken(token: string): Promise<Session | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM sessions WHERE token = ? AND expires_at > ?
    `)
      .bind(token, new Date().toISOString())
      .first();

    return result ? this.mapSession(result) : null;
  }

  async updateSessionAccess(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE sessions 
      SET last_accessed_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(`
      DELETE FROM sessions WHERE id = ?
    `).bind(id).run();

    return result.success;
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.env.DB.prepare(`
      DELETE FROM sessions WHERE expires_at <= ?
    `).bind(new Date().toISOString()).run();
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.env.DB.prepare(`
      DELETE FROM sessions WHERE user_id = ?
    `).bind(userId).run();
  }

  private mapSession(row: any): Session {
    return {
      id: row.id,
      user_id: row.user_id,
      token: row.token,
      user_agent: row.user_agent,
      ip_address: row.ip_address,
      expires_at: row.expires_at,
      created_at: row.created_at,
      last_accessed_at: row.last_accessed_at
    };
  }

  // ============ Password Reset ============

  async createPasswordReset(reset: Omit<PasswordReset, 'id' | 'created_at'>): Promise<PasswordReset> {
    const id = this.generateId('pwd_reset');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO password_resets (
        id, user_id, token_hash, expires_at, used_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        reset.user_id,
        reset.token_hash,
        reset.expires_at,
        reset.used_at || null,
        now
      )
      .first<PasswordReset>();

    return this.mapPasswordReset(result);
  }

  async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM password_resets 
      WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL
    `)
      .bind(tokenHash, new Date().toISOString())
      .first();

    return result ? this.mapPasswordReset(result) : null;
  }

  async markPasswordResetAsUsed(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE password_resets 
      SET used_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();
  }

  async deleteExpiredPasswordResets(): Promise<void> {
    await this.env.DB.prepare(`
      DELETE FROM password_resets WHERE expires_at <= ?
    `).bind(new Date().toISOString()).run();
  }

  private mapPasswordReset(row: any): PasswordReset {
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: row.expires_at,
      used_at: row.used_at,
      created_at: row.created_at
    };
  }

  // ============ Email Verification ============

  async createEmailVerification(verification: Omit<EmailVerification, 'id' | 'created_at'>): Promise<EmailVerification> {
    const id = this.generateId('email_verify');
    const now = new Date().toISOString();
    
    const result = await this.env.DB.prepare(`
      INSERT INTO email_verifications (
        id, user_id, token_hash, expires_at, verified_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      .bind(
        id,
        verification.user_id,
        verification.token_hash,
        verification.expires_at,
        verification.verified_at || null,
        now
      )
      .first<EmailVerification>();

    return this.mapEmailVerification(result);
  }

  async getEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerification | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM email_verifications 
      WHERE token_hash = ? AND expires_at > ? AND verified_at IS NULL
    `)
      .bind(tokenHash, new Date().toISOString())
      .first();

    return result ? this.mapEmailVerification(result) : null;
  }

  async markEmailVerificationAsVerified(id: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE email_verifications 
      SET verified_at = ? 
      WHERE id = ?
    `)
      .bind(new Date().toISOString(), id)
      .run();
  }

  async deleteExpiredEmailVerifications(): Promise<void> {
    await this.env.DB.prepare(`
      DELETE FROM email_verifications WHERE expires_at <= ?
    `).bind(new Date().toISOString()).run();
  }

  private mapEmailVerification(row: any): EmailVerification {
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: row.expires_at,
      verified_at: row.verified_at,
      created_at: row.created_at
    };
  }

  // ============ Analytics ============

  async getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
    activeServices: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      activeUsers,
      totalOrders,
      totalRevenue,
      pendingOrders,
      activeServices
    ] = await Promise.all([
      this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL
      `).first<{ count: number }>(),
      
      this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM users 
        WHERE status = 'active' 
        AND deleted_at IS NULL 
        AND last_login > ?
      `).bind(thirtyDaysAgo.toISOString()).first<{ count: number }>(),
      
      this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM orders 
        WHERE status IN ('completed', 'confirmed', 'in_progress')
      `).first<{ count: number }>(),
      
      this.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM payments 
        WHERE status = 'completed'
      `).first<{ total: number }>(),
      
      this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM orders WHERE status = 'pending'
      `).first<{ count: number }>(),
      
      this.env.DB.prepare(`
        SELECT COUNT(*) as count FROM services 
        WHERE is_active = 1 AND deleted_at IS NULL
      `).first<{ count: number }>()
    ]);

    return {
      totalUsers: totalUsers?.count || 0,
      activeUsers: activeUsers?.count || 0,
      totalOrders: totalOrders?.count || 0,
      totalRevenue: totalRevenue?.total || 0,
      pendingOrders: pendingOrders?.count || 0,
      activeServices: activeServices?.count || 0
    };
  }

  async getRevenueByPeriod(startDate: string, endDate: string): Promise<
    Array<{ date: string; revenue: number }>
  > {
    const result = await this.env.DB.prepare(`
      SELECT 
        DATE(completed_at) as date,
        SUM(amount) as revenue
      FROM payments 
      WHERE status = 'completed' 
        AND completed_at BETWEEN ? AND ?
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `)
      .bind(startDate, endDate)
      .all<{ date: string; revenue: number }>();

    return result.results;
  }

  // ============ Database Maintenance ============

  async backupDatabase(): Promise<string> {
    const tables = ['users', 'categories', 'services', 'orders', 'payments', 'payment_intents', 'notifications', 'files', 'system_logs', 'api_keys', 'sessions', 'password_resets', 'email_verifications'];
    
    const backup: Record<string, any[]> = {};
    
    for (const table of tables) {
      const result = await this.env.DB.prepare(`SELECT * FROM ${table}`).all();
      backup[table] = result.results;
    }
    
    return JSON.stringify(backup, null, 2);
  }

  async executeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const result = await this.env.DB.prepare(query).bind(...params).all();
    return result.results as T[];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.env.DB.prepare('SELECT 1').first();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}