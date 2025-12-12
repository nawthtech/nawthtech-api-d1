/**
 * 404 Not Found handler
 */

import type { IRequest } from 'itty-router';

export function handleNotFound(request: IRequest): Response {
  const url = new URL(request.url);
  
  const response = {
    success: false,
    error: 'Not Found',
    message: `The requested resource ${url.pathname} was not found`,
    path: url.pathname,
    method: request.method,
    timestamp: new Date().toISOString(),
    documentation: 'https://docs.nawthtech.com/api',
  };
  
  return new Response(JSON.stringify(response, null, 2), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}