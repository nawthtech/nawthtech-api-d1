/**
 * Services handlers
 */

import type { IRequest } from 'itty-router';
import type { Env, User, Service, CreateServiceRequest, UpdateProfileRequest } from '../../../types/database';
import { successResponse, errorResponse, paginatedResponse } from '../../../utils/responses';

export async function createService(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const data = (request as any).validatedData as CreateServiceRequest;
    
    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Check if slug already exists
    const existingService = await env.DB.prepare(
      'SELECT id FROM services WHERE slug = ? AND deleted_at IS NULL'
    ).bind(slug).first();
    
    if (existingService) {
      // Add random suffix if slug exists
      const uniqueSlug = `${slug}-${Math.random().toString(36).substr(2, 6)}`;
      data.name = data.name; // Keep original name
    }
    
    const serviceId = crypto.randomUUID();
    
    await env.DB.prepare(`
      INSERT INTO services (id, user_id, name, slug, description, category, tags, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      serviceId,
      user.id,
      data.name,
      slug,
      data.description || null,
      data.category || null,
      data.tags ? data.tags.join(',') : null,
      JSON.stringify(data.config || {})
    ).run();
    
    // Get created service
    const service = await env.DB.prepare(`
      SELECT * FROM services WHERE id = ?
    `).bind(serviceId).first<Service>();
    
    return new Response(
      JSON.stringify(successResponse(service, 'Service created successfully')),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Create service error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to create service')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function getServices(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');
    const offset = (page - 1) * limit;
    
    // Build query
    let whereClause = 'WHERE deleted_at IS NULL';
    const params: any[] = [];
    
    // Non-admin users can only see their own services
    if (user.role !== 'admin') {
      whereClause += ' AND user_id = ?';
      params.push(user.id);
    }
    
    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }
    
    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }
    
    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Get total count
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM services ${whereClause}
    `).bind(...params).first<{ total: number }>();
    
    // Get services
    const services = await env.DB.prepare(`
      SELECT * FROM services ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<Service>();
    
    // Parse JSON fields
    const parsedServices = services.results.map(service => ({
      ...service,
      config: JSON.parse(service.config || '{}'),
      tags: service.tags ? service.tags.split(',') : [],
    }));
    
    return new Response(
      JSON.stringify(paginatedResponse(
        parsedServices,
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
    console.error('Get services error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to get services')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function getServiceById(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const serviceId = request.params?.id;
    
    const service = await env.DB.prepare(`
      SELECT * FROM services WHERE id = ? AND deleted_at IS NULL
    `).bind(serviceId).first<Service>();
    
    if (!service) {
      return new Response(
        JSON.stringify(errorResponse('Service not found')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check permission
    if (user.role !== 'admin' && service.user_id !== user.id) {
      return new Response(
        JSON.stringify(errorResponse('Access denied')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Parse JSON fields
    const parsedService = {
      ...service,
      config: JSON.parse(service.config || '{}'),
      tags: service.tags ? service.tags.split(',') : [],
    };
    
    // Increment view count
    await env.DB.prepare(`
      UPDATE services SET views = views + 1 WHERE id = ?
    `).bind(serviceId).run();
    
    return new Response(
      JSON.stringify(successResponse(parsedService)),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Get service by ID error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to get service')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function updateService(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const serviceId = request.params?.id;
    const data = (request as any).validatedData as UpdateProfileRequest;
    
    // Check if service exists and user has permission
    const service = await env.DB.prepare(`
      SELECT * FROM services WHERE id = ? AND deleted_at IS NULL
    `).bind(serviceId).first<Service>();
    
    if (!service) {
      return new Response(
        JSON.stringify(errorResponse('Service not found')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (user.role !== 'admin' && service.user_id !== user.id) {
      return new Response(
        JSON.stringify(errorResponse('Access denied')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
      
      // Update slug if name changed
      const newSlug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      updates.push('slug = ?');
      params.push(newSlug);
    }
    
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description || null);
    }
    
    if (data.category !== undefined) {
      updates.push('category = ?');
      params.push(data.category || null);
    }
    
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      params.push(data.tags ? data.tags.join(',') : null);
    }
    
    if (data.config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(data.config));
    }
    
    if (data.status !== undefined && user.role === 'admin') {
      updates.push('status = ?');
      params.push(data.status);
      
      if (data.status === 'active') {
        updates.push('approved_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (updates.length === 0) {
      return new Response(
        JSON.stringify(errorResponse('No fields to update')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(serviceId);
    
    const query = `
      UPDATE services 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `;
    
    await env.DB.prepare(query).bind(...params).run();
    
    // Get updated service
    const updatedService = await env.DB.prepare(`
      SELECT * FROM services WHERE id = ?
    `).bind(serviceId).first<Service>();
    
    // Parse JSON fields
    const parsedService = {
      ...updatedService,
      config: JSON.parse(updatedService?.config || '{}'),
      tags: updatedService?.tags ? updatedService.tags.split(',') : [],
    };
    
    return new Response(
      JSON.stringify(successResponse(parsedService, 'Service updated successfully')),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Update service error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to update service')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function deleteService(
  request: IRequest,
  env: Env
): Promise<Response> {
  try {
    const user = (request as any).user as User;
    const serviceId = request.params?.id;
    
    // Check if service exists and user has permission
    const service = await env.DB.prepare(`
      SELECT * FROM services WHERE id = ? AND deleted_at IS NULL
    `).bind(serviceId).first<Service>();
    
    if (!service) {
      return new Response(
        JSON.stringify(errorResponse('Service not found')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (user.role !== 'admin' && service.user_id !== user.id) {
      return new Response(
        JSON.stringify(errorResponse('Access denied')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Soft delete
    await env.DB.prepare(`
      UPDATE services 
      SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(serviceId).run();
    
    return new Response(
      JSON.stringify(successResponse(null, 'Service deleted successfully')),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Delete service error:', error);
    return new Response(
      JSON.stringify(errorResponse('Failed to delete service')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}