/**
 * CORS middleware
 */

import type { IRequest } from 'itty-router';
import type { Env } from '../types/database';

export function handleCORS(request: IRequest, env: Env) {
  const allowedOrigins = env.ALLOWED_ORIGINS 
    ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['https://nawthtech.com', 'https://www.nawthtech.com'];

  const origin = request.headers.get('Origin');
  const allowedOrigin = allowedOrigins.includes(origin || '') 
    ? origin 
    : allowedOrigins[0];

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to all responses
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Credentials': 'true',
  };
}