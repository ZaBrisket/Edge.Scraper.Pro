// src/lib/auth/token.ts
import { AuthService } from './index'; // keep existing import pathing

export function extractBearerToken(headers: Record<string, string | undefined>) {
  const auth = headers.authorization || (headers as any).Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);

  const cookie = headers.cookie || (headers as any).Cookie;
  if (!cookie) return null;
  const m = cookie.match(/(?:^|;\s*)esp_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function requireAuth(headers: Record<string, string | undefined>) {
  const isDev = process.env.NETLIFY_DEV === 'true';
  if (isDev) return { dev: true };

  const token = extractBearerToken(headers);
  if (!token) throw new Error('Authorization token required');

  const payload = AuthService.verifyToken(token);
  return payload;
}