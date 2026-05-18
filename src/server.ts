import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';

import {
  initDb,
  listItems,
  getItemById,
  updateItem,
  deleteItem,
  getStats,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.CLIPSTASH_PORT || 3879);
const DIST_DIR = path.resolve(__dirname, '../web/dist');

initDb();

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    name: 'clipstash',
    time: new Date().toISOString(),
  });
});

app.get('/api/stats', (c) => {
  return c.json(getStats());
});

app.get('/api/items', (c) => {
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

app.get('/api/items/:id', (c) => {
  const id = Number(c.req.param('id'));
  const item = getItemById(id);

  if (!item) {
    return c.json({ error: 'Item not found' }, 404);
  }

  return c.json(item);
});

app.patch('/api/items/:id', async (c) => {
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

app.delete('/api/items/:id', (c) => {
  const id = Number(c.req.param('id'));
  const deleted = deleteItem(id);

  if (!deleted) {
    return c.json({ error: 'Item not found' }, 404);
  }

  return c.json({ ok: true });
});

// 打包后的前端静态文件
app.use('/*', serveStatic({ root: DIST_DIR }));

app.get('*', serveStatic({ path: path.join(DIST_DIR, 'index.html') }));

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`Clipstash Web UI: http://localhost:${info.port}`);
  }
);

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
