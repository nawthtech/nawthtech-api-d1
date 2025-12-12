/**
 * Health check handler
 */

import type { IRequest } from 'itty-router';
import type { Env } from '../types/database';

export async function handleHealthCheck(
  request: IRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // Check database connection
    const dbCheck = await env.DB.prepare('SELECT 1 as status').first();
    
    // Check KV storage
    await env.KV.put('health_check', Date.now().toString(), {
      expirationTtl: 60,
    });
    
    // Check R2 storage if configured
    let r2Status = 'not_configured';
    if (env.R2) {
      try {
        await env.R2.list({ limit: 1 });
        r2Status = 'healthy';
      } catch (error) {
        r2Status = 'unhealthy';
      }
    }
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: env.ENVIRONMENT || 'production',
      uptime: process.uptime?.(),
      response_time: Date.now() - startTime,
      services: {
        database: !!dbCheck,
        kv: true,
        r2: r2Status,
      },
      checks: {
        memory_usage: process.memoryUsage?.(),
        timestamp: new Date().toISOString(),
      },
    };
    
    return new Response(JSON.stringify(health, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    const health = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        database: false,
        kv: false,
        r2: 'unknown',
      },
    };
    
    return new Response(JSON.stringify(health, null, 2), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}