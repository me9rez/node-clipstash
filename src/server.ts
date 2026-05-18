import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, Env } from 'hono';

import {
  initDb,
  listItems,
  getItemById,
  updateItem,
  deleteItem,
  getStats,
  saveItem,
  hasUsers,
  createUser,
  createApiToken,
  findUserByUsername,
  findUserById,
  listUsers,
  deleteUser as deleteUserDb,
  updateUserPassword,
  listApiTokens,
  deleteApiToken,
} from './db.js';
import {
  authMiddleware,
  requireAdmin,
  hashPassword,
  verifyPassword,
  generateToken,
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../web/dist');

interface AppVariables {
  userId: number;
  user: { id: number; is_admin: number };
}

type AppEnv = Env & { Variables: AppVariables };

export function createApp() {
  initDb();

  const app = new Hono<AppEnv>();

  const corsOrigin = process.env.CLIPSTASH_CORS_ORIGIN || '';
  const corsOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

  if (corsOrigin) {
    corsOrigins.push(corsOrigin);
  }

  app.use(
    '/api/*',
    cors({
      origin: corsOrigins,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.get('/api/health', (c) => {
    return c.json({
      ok: true,
      name: 'clipstash',
      time: new Date().toISOString(),
    });
  });

  app.post('/api/auth/login', async (c) => {
    const body = await safeJson(c);

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return c.json({ error: 'Username and password are required' }, 400);
    }

    const user = findUserByUsername(username);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return c.json({ error: 'Invalid username or password' }, 401);
    }

    const token = generateToken();
    const name = `Web login ${new Date().toISOString()}`;

    createApiToken(user.id, token, name);

    return c.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        is_admin: Boolean(user.is_admin),
        created_at: user.created_at,
      },
    });
  });

  app.get('/api/auth/me', authMiddleware, (c) => {
    const userId = c.get('userId') as number;
    const user = findUserById(userId);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      username: user.username,
      is_admin: Boolean(user.is_admin),
      created_at: user.created_at,
    });
  });

  app.post('/api/auth/change-password', authMiddleware, async (c) => {
    const userId = c.get('userId') as number;
    const body = await safeJson(c);

    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current password and new password are required' }, 400);
    }

    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400);
    }

    const user = findUserById(userId);

    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    updateUserPassword(userId, hashPassword(newPassword));

    return c.json({ ok: true });
  });

  app.get('/api/stats', authMiddleware, (c) => {
    return c.json(getStats());
  });

  app.get('/api/items', authMiddleware, (c) => {
    const query = c.req.query();

    const limit = clampInt(query.limit, 1, 200, 50);
    const offset = clampInt(query.offset, 0, 1000000, 0);

    const result = listItems({
      limit,
      offset,
      type: query.type || 'all',
      status: query.status || 'all',
      q: query.q || '',
    });

    return c.json(result);
  });

  app.post('/api/items', authMiddleware, async (c) => {
    const body = await safeJson(c);

    const reqType = typeof body.type === 'string' ? body.type : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const owner = typeof body.owner === 'string' ? body.owner.trim() : '';
    const repo = typeof body.repo === 'string' ? body.repo.trim() : '';

    if (!url || !host) {
      return c.json({ error: 'url and host are required' }, 400);
    }

    if (reqType !== 'github-repo' && reqType !== 'url') {
      return c.json({ error: 'type must be "github-repo" or "url"' }, 400);
    }

    const result = saveItem({
      type: reqType,
      title: title || url,
      url,
      host,
      owner: owner || null,
      repo: repo || null,
    });

    return c.json(result);
  });

  app.get('/api/items/:id', authMiddleware, (c) => {
    const id = Number(c.req.param('id'));
    const item = getItemById(id);

    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    return c.json(item);
  });

  app.patch('/api/items/:id', authMiddleware, async (c) => {
    const id = Number(c.req.param('id'));
    const body = await safeJson(c);

    const existing = getItemById(id);

    if (!existing) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const patch: Record<string, string> = {};

    if (typeof body.title === 'string') {
      patch.title = body.title.trim();
    }

    if (typeof body.status === 'string') {
      if (!['unread', 'read', 'archived'].includes(body.status)) {
        return c.json({ error: 'Invalid status' }, 400);
      }

      patch.status = body.status;
    }

    if (typeof body.tags === 'string') {
      patch.tags = body.tags.trim();
    }

    if (typeof body.note === 'string') {
      patch.note = body.note.trim();
    }

    const updated = updateItem(id, patch);

    return c.json(updated);
  });

  app.delete('/api/items/:id', authMiddleware, (c) => {
    const id = Number(c.req.param('id'));
    const deleted = deleteItem(id);

    if (!deleted) {
      return c.json({ error: 'Item not found' }, 404);
    }

    return c.json({ ok: true });
  });

  app.get('/api/users', authMiddleware, requireAdmin, (c) => {
    const users = listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      is_admin: Boolean(u.is_admin),
      created_at: u.created_at,
    }));

    return c.json(users);
  });

  app.post('/api/users', authMiddleware, requireAdmin, async (c) => {
    const body = await safeJson(c);

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username) {
      return c.json({ error: 'Username is required' }, 400);
    }

    if (!password || password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const existing = findUserByUsername(username);

    if (existing) {
      return c.json({ error: 'Username already exists' }, 409);
    }

    const user = createUser(username, hashPassword(password), false);

    return c.json(
      {
        id: user.id,
        username: user.username,
        is_admin: false,
        created_at: user.created_at,
      },
      201
    );
  });

  app.delete('/api/users/:id', authMiddleware, requireAdmin, (c) => {
    const id = Number(c.req.param('id'));
    const loggedInUserId = c.get('userId') as number;

    if (id === loggedInUserId) {
      return c.json({ error: 'Cannot delete yourself' }, 400);
    }

    const deleted = deleteUserDb(id);

    if (!deleted) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ ok: true });
  });

  app.get('/api/tokens', authMiddleware, (c) => {
    const userId = c.get('userId') as number;
    const tokens = listApiTokens(userId).map((t) => ({
      id: t.id,
      token: t.token,
      name: t.name,
      created_at: t.created_at,
    }));

    return c.json(tokens);
  });

  app.post('/api/tokens', authMiddleware, async (c) => {
    const userId = c.get('userId') as number;
    const body = await safeJson(c);

    const name = typeof body.name === 'string' ? body.name.trim() : 'Unnamed token';
    const token = generateToken();
    const result = createApiToken(userId, token, name);

    return c.json(
      {
        id: result.id,
        token: result.token,
        name: result.name,
        created_at: result.created_at,
      },
      201
    );
  });

  app.delete('/api/tokens/:id', authMiddleware, (c) => {
    const userId = c.get('userId') as number;
    const id = Number(c.req.param('id'));

    const tokens = listApiTokens(userId);
    const targetToken = tokens.find((t) => t.id === id);

    if (!targetToken) {
      return c.json({ error: 'Token not found' }, 404);
    }

    deleteApiToken(id);

    return c.json({ ok: true });
  });

  app.use('/*', serveStatic({ root: DIST_DIR }));

  app.get('*', serveStatic({ path: path.join(DIST_DIR, 'index.html') }));

  return app;
}

export function startServer(port?: number) {
  const resolvedPort = port ?? Number(process.env.CLIPSTASH_PORT || 3879);

  const app = createApp();

  serve(
    {
      fetch: app.fetch,
      port: resolvedPort,
    },
    (info) => {
      console.log(`Clipstash API: http://localhost:${info.port}`);
      console.log(`Clipstash Web UI: http://localhost:${info.port}`);

      if (!hasUsers()) {
        const password = generateToken().slice(0, 16);
        const passwordHash = hashPassword(password);
        const user = createUser('admin', passwordHash, true);
        const token = generateToken();

        createApiToken(user.id, token, 'Bootstrap admin token');

        console.log('');
        console.log('=== 首次启动 — 管理员凭据 ===');
        console.log(`用户名: admin`);
        console.log(`密码:   ${password}`);
        console.log(`令牌:   ${token}`);
        console.log('请立即登录 WebUI 修改密码！');
        console.log('==============================');
        console.log('');
      }
    }
  );
}

export function bootstrapCheck() {
  initDb();

  if (!hasUsers()) {
    const password = generateToken().slice(0, 16);
    const passwordHash = hashPassword(password);
    const user = createUser('admin', passwordHash, true);
    const token = generateToken();

    createApiToken(user.id, token, 'Bootstrap admin token');

    console.log('');
    console.log('=== 首次启动 — 管理员凭据 ===');
    console.log(`用户名: admin`);
    console.log(`密码:   ${password}`);
    console.log(`令牌:   ${token}`);
    console.log('请立即登录 WebUI 修改密码！');
    console.log('==============================');
    console.log('');

    return { user, token };
  }

  return null;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

async function safeJson(c: Context): Promise<Record<string, unknown>> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}
