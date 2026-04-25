import { cors } from 'hono/cors';
import { config } from '../config/index.ts';

export const corsMiddleware = cors({
  origin: config.CORS_ALLOWED_ORIGINS.split(','),
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
});