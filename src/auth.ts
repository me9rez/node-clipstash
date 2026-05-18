import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { findUserByToken } from './db.js';
import type { AppVariables } from './types.js';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;

  const salt = parts[0]!;
  const hash = parts[1]!;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');

  if (derived.length !== expected.length) return false;

  return timingSafeEqual(derived, expected);
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export const authMiddleware: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const header = c.req.header('Authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = header.slice(7).trim();

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = findUserByToken(token);

  if (!user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  c.set('userId', user.id);
  c.set('user', { id: user.id, is_admin: user.is_admin });

  await next();
};

export const requireAdmin: MiddlewareHandler<{ Variables: { user: AppVariables['user'] } }> = async (c, next) => {
  const user = c.get('user');

  if (!user || !user.is_admin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await next();
};
