/**
 * Static file handler
 */

import type { IRequest } from 'itty-router';
import type { Env } from '../types/database';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

export async function handleStaticFile(
  request: IRequest,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;
  
  // Default to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }
  
  // Remove leading slash for R2
  const key = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  
  try {
    // Try to get from R2
    const object = await env.R2?.get(key);
    
    if (!object) {
      return new Response('File not found', { status: 404 });
    }
    
    // Determine content type
    const extension = key.includes('.') 
      ? key.substring(key.lastIndexOf('.')) 
      : '';
    const contentType = MIME_TYPES[extension.toLowerCase()] || 'application/octet-stream';
    
    // Set cache headers for static assets
    const headers = new Headers({
      'Content-Type': contentType,
    });
    
    if (extension.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf)$/)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'no-cache');
    }
    
    // Add CORS headers
    headers.set('Access-Control-Allow-Origin', '*');
    
    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error('Static file error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}