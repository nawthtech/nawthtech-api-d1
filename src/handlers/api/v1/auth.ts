/**
 * Authentication handlers
 */

import type { IRequest } from 'itty-router';
import type { Env, User, RegisterRequest, LoginRequest, UpdateProfileRequest } from '../../../types/database';
import { 
  hashPassword, 
  verifyPassword, 
  generateJWT, 
  verifyJWT,
  generateApiKey 
} from '../../../utils/crypto';
import { successResponse, errorResponse, paginatedResponse } from '../../../utils/responses';

export async function registerUser(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const data = (request as any).validatedData as RegisterRequest;
    
    // Check if email already exists
    const existingEmail = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL'
    ).bind(data.email).first();
    
    if (existingEmail) {
      return new Response(
        JSON.stringify(errorResponse('Email already registered')),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if username already exists
    const existingUsername = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL'
    ).bind(data.username).first();
    
    if (existingUsername) {
      return new Response(
        JSON.stringify(errorResponse('Username already taken')),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Hash password
    const passwordHash = await hashPassword(data.password);
    const userId = crypto.randomUUID();
    
    // Insert user
    await env.DB.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      userId,
      data.email,
      data.username,
      passwordHash,
      data.full_name || null
    ).run();
    
    // Generate JWT token
    const token = await generateJWT({ userId }, env.JWT_SECRET);
    
    // Get created user (without password hash)
    const user = await env.DB.prepare(`
      SELECT id, email, username, role, email_verified, full_name, 
             created_at, quota_text_tokens, quota_images, 
             quota_videos, quota_audio_minutes
      FROM users WHERE id = ?
    `).bind(userId).first<User>();
    
    // Send welcome email (in background)
    // env.AI_QUEUE?.send({
    //   type: 'welcome_email',
    //   userId,
    //   email: data.email,
    // });
    
    return new Response(
      JSON.stringify(successResponse({
        user,
        token,
      }, 'Registration successful')),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify(errorResponse('Registration failed')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function loginUser(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const data = (request as any).validatedData as LoginRequest;
    
    // Get user with password hash
    const user = await env.DB.prepare(`
      SELECT * FROM users 
      WHERE email = ? AND deleted_at IS NULL
    `).bind(data.email).first<User>();
    
    if (!user) {
      return new Response(
        JSON.stringify(errorResponse('Invalid credentials')),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Verify password
    const isValid = await verifyPassword(data.password, user.password_hash);
    if (!isValid) {
      return new Response(
        JSON.stringify(errorResponse('Invalid credentials')),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Update last login
    await env.DB.prepare(`
      UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(user.id).run();
    
    // Generate JWT token
    const token = await generateJWT({ userId: user.id }, env.JWT_SECRET);
    
    // Remove sensitive data
    const { password_hash, ...userWithoutPassword } = user;
    
    return new Response(
      JSON.stringify(successResponse({
        user: userWithoutPassword,
        token,
      }, 'Login successful')),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify(errorResponse('Login failed')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function getCurrentUser(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    
    // Get fresh user data
    const freshUser = await env.DB.prepare(`
      SELECT id, email, username, role, email_verified, full_name, avatar_url, bio,
             settings, created_at, updated_at, last_login_at,
             quota_text_tokens, quota_images, quota_videos, quota_audio_minutes
      FROM users WHERE id = ? AND deleted_at IS NULL
    `).bind(user.id).first<User>();
    
    if (!freshUser) {
      return new Response(
        JSON.stringify(errorResponse('User not found')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify(successResponse(freshUser)),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Get current user error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to get user')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function updateUser(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const data = (request as any).validatedData as UpdateProfileRequest;
    
    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    
    if (data.full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(data.full_name || null);
    }
    
    if (data.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(data.avatar_url || null);
    }
    
    if (data.bio !== undefined) {
      updates.push('bio = ?');
      params.push(data.bio || null);
    }
    
    if (data.settings !== undefined) {
      updates.push('settings = ?');
      params.push(JSON.stringify(data.settings));
    }
    
    if (updates.length === 0) {
      return new Response(
        JSON.stringify(errorResponse('No fields to update')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Add updated_at and user id
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(user.id);
    
    const query = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = ? AND deleted_at IS NULL
    `;
    
    await env.DB.prepare(query).bind(...params).run();
    
    // Get updated user
    const updatedUser = await env.DB.prepare(`
      SELECT id, email, username, role, email_verified, full_name, avatar_url, bio,
             settings, created_at, updated_at, last_login_at,
             quota_text_tokens, quota_images, quota_videos, quota_audio_minutes
      FROM users WHERE id = ? AND deleted_at IS NULL
    `).bind(user.id).first<User>();
    
    return new Response(
      JSON.stringify(successResponse(updatedUser, 'Profile updated successfully')),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Update user error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to update profile')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function listUsers(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const search = url.searchParams.get('search');
    const role = url.searchParams.get('role');
    const offset = (page - 1) * limit;
    
    // Build query
    let whereClause = 'WHERE deleted_at IS NULL';
    const params: any[] = [];
    
    if (search) {
      whereClause += ' AND (email LIKE ? OR username LIKE ? OR full_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (role) {
      whereClause += ' AND role = ?';
      params.push(role);
    }
    
    // Get total count
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `).bind(...params).first<{ total: number }>();
    
    // Get users
    const users = await env.DB.prepare(`
      SELECT id, email, username, role, email_verified, full_name, avatar_url,
             created_at, updated_at, last_login_at,
             quota_text_tokens, quota_images, quota_videos, quota_audio_minutes
      FROM users ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<User>();
    
    return new Response(
      JSON.stringify(paginatedResponse(
        users.results,
        countResult?.total || 0,
        page,
        limit
      )),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('List users error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to list users')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function getUserById(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const userId = request.params?.id;
    const requestingUser = (request as any).user as User;
    
    // Users can only see their own profile unless admin
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      return new Response(
        JSON.stringify(errorResponse('Access denied')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const user = await env.DB.prepare(`
      SELECT id, email, username, role, email_verified, full_name, avatar_url, bio,
             created_at, updated_at, last_login_at,
             quota_text_tokens, quota_images, quota_videos, quota_audio_minutes
      FROM users WHERE id = ? AND deleted_at IS NULL
    `).bind(userId).first<User>();
    
    if (!user) {
      return new Response(
        JSON.stringify(errorResponse('User not found')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify(successResponse(user)),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Get user by ID error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to get user')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}