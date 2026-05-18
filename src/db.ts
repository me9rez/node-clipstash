import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { runMigrations } from './migration.js';
import type { ParsedItem } from './parser.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'clipmark.db');

let db: DatabaseSync | undefined;

export interface DbItem {
  id: number;
  type: 'github-repo' | 'url';
  title: string | null;
  url: string;
  host: string | null;
  owner: string | null;
  repo: string | null;
  status: 'unread' | 'read' | 'archived';
  tags: string | null;
  note: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_count: number;
}

export interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export interface DbApiToken {
  id: number;
  user_id: number;
  token: string;
  name: string;
  created_at: string;
}

export interface SaveItemResult {
  created: boolean;
  item: DbItem;
}

export interface ListItemsOptions {
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
  q?: string;
}

export interface ListItemsResult {
  items: DbItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResult {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export function initDb(): DatabaseSync {
  if (db) {
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new DatabaseSync(DB_PATH);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const result = runMigrations({
    db,
    dbPath: DB_PATH,
    dataDir: DATA_DIR,
    backup: true,
  });

  if (result.applied.length > 0) {
    console.log('[migration] summary:', result.applied);
  }

  return db;
}

export function getDb(): DatabaseSync {
  if (!db) {
    initDb();
  }

  return db!;
}

export function saveItem(item: ParsedItem): SaveItemResult {
  const database = getDb();
  const now = new Date().toISOString();

  const existing = database
    .prepare('SELECT * FROM items WHERE url = ?')
    .get(item.url) as DbItem | undefined;

  if (existing) {
    database.prepare(`
      UPDATE items
      SET last_seen_at = ?,
          seen_count = seen_count + 1
      WHERE url = ?
    `).run(now, item.url);

    return {
      created: false,
      item: {
        ...existing,
        last_seen_at: now,
        seen_count: Number(existing.seen_count || 1) + 1,
      },
    };
  }

  const result = database.prepare(`
    INSERT INTO items (
      type,
      title,
      url,
      host,
      owner,
      repo,
      first_seen_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.type,
    item.title ?? null,
    item.url,
    item.host ?? null,
    item.owner ?? null,
    item.repo ?? null,
    now,
    now
  );

  return {
    created: true,
    item: {
      id: Number(result.lastInsertRowid),
      type: item.type,
      title: item.title,
      url: item.url,
      host: item.host,
      owner: item.owner,
      repo: item.repo,
      status: 'unread',
      tags: null,
      note: null,
      first_seen_at: now,
      last_seen_at: now,
      seen_count: 1,
    },
  };
}

export function listItems({ limit = 50, offset = 0, type, status, q }: ListItemsOptions = {}): ListItemsResult {
  const database = getDb();

  const where: string[] = [];
  const queryParams: Record<string, SQLInputValue> = {};
  const listParams: Record<string, SQLInputValue> = {
    '@limit': limit,
    '@offset': offset,
  };

  if (type && type !== 'all') {
    where.push('type = @type');
    queryParams['@type'] = type;
    listParams['@type'] = type;
  }

  if (status && status !== 'all') {
    where.push('status = @status');
    queryParams['@status'] = status;
    listParams['@status'] = status;
  }

  if (q && q.trim()) {
    where.push(`(
      title LIKE @q OR
      url LIKE @q OR
      host LIKE @q OR
      owner LIKE @q OR
      repo LIKE @q OR
      tags LIKE @q OR
      note LIKE @q
    )`);

    const keyword = `%${q.trim()}%`;

    queryParams['@q'] = keyword;
    listParams['@q'] = keyword;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const items = database.prepare(`
    SELECT *
    FROM items
    ${whereSql}
    ORDER BY last_seen_at DESC
    LIMIT @limit OFFSET @offset
  `).all(listParams) as unknown as DbItem[];

  const totalRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM items
    ${whereSql}
  `).get(queryParams) as { count: number } | undefined;

  return {
    items,
    total: totalRow?.count ?? 0,
    limit,
    offset,
  };
}

export function getItemById(id: number): DbItem | undefined {
  const database = getDb();

  return database.prepare(`
    SELECT *
    FROM items
    WHERE id = ?
  `).get(id) as DbItem | undefined;
}

export function updateItem(id: number, patch: Partial<Pick<DbItem, 'title' | 'status' | 'tags' | 'note'>>): DbItem | undefined {
  const database = getDb();

  const allowedFields = ['title', 'status', 'tags', 'note'] as const;
  const entries = Object.entries(patch)
    .filter(([key]) => (allowedFields as readonly string[]).includes(key));

  if (entries.length === 0) {
    return getItemById(id);
  }

  const sets: string[] = [];
  const params: Record<string, SQLInputValue> = {
    '@id': id,
  };

  for (const [key, value] of entries) {
    const paramName = `@${key}`;

    sets.push(`${key} = ${paramName}`);
    params[paramName] = value;
  }

  database.prepare(`
    UPDATE items
    SET ${sets.join(', ')}
    WHERE id = @id
  `).run(params);

  return getItemById(id);
}

export function deleteItem(id: number): boolean {
  const database = getDb();

  const item = getItemById(id);

  if (!item) {
    return false;
  }

  database.prepare(`
    DELETE FROM items
    WHERE id = ?
  `).run(id);

  return true;
}

export function getStats(): StatsResult {
  const database = getDb();

  const totalRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM items
  `).get() as { count: number } | undefined;

  const byType = database.prepare(`
    SELECT type, COUNT(*) AS count
    FROM items
    GROUP BY type
    ORDER BY count DESC
  `).all() as { type: string; count: number }[];

  const byStatus = database.prepare(`
    SELECT status, COUNT(*) AS count
    FROM items
    GROUP BY status
    ORDER BY count DESC
  `).all() as { status: string; count: number }[];

  return {
    total: totalRow?.count ?? 0,
    byType,
    byStatus,
  };
}

export function hasUsers(): boolean {
  const database = getDb();

  const row = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };

  return row.count > 0;
}

export function createUser(username: string, passwordHash: string, isAdmin: boolean = false): DbUser {
  const database = getDb();
  const now = new Date().toISOString();

  const result = database.prepare(`
    INSERT INTO users (username, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, isAdmin ? 1 : 0, now);

  return {
    id: Number(result.lastInsertRowid),
    username,
    password_hash: passwordHash,
    is_admin: isAdmin ? 1 : 0,
    created_at: now,
  };
}

export function findUserByToken(token: string): (DbUser & { token_id: number }) | undefined {
  const database = getDb();

  const row = database.prepare(`
    SELECT u.*, t.id AS token_id
    FROM api_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token = ?
  `).get(token) as (DbUser & { token_id: number }) | undefined;

  return row;
}

export function findUserByUsername(username: string): DbUser | undefined {
  const database = getDb();

  return database.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
}

export function findUserById(id: number): DbUser | undefined {
  const database = getDb();

  return database.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function createApiToken(userId: number, token: string, name: string): DbApiToken {
  const database = getDb();
  const now = new Date().toISOString();

  const result = database.prepare(`
    INSERT INTO api_tokens (user_id, token, name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, token, name, now);

  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    token,
    name,
    created_at: now,
  };
}

export function listUsers(): DbUser[] {
  const database = getDb();

  return database.prepare('SELECT * FROM users ORDER BY id ASC').all() as unknown as DbUser[];
}

export function deleteUser(id: number): boolean {
  const database = getDb();

  const user = findUserById(id);

  if (!user) {
    return false;
  }

  database.prepare('DELETE FROM users WHERE id = ?').run(id);

  return true;
}

export function updateUserPassword(id: number, passwordHash: string): boolean {
  const database = getDb();

  const user = findUserById(id);

  if (!user) {
    return false;
  }

  database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

  return true;
}

export function listApiTokens(userId: number): DbApiToken[] {
  const database = getDb();

  return database.prepare(
    'SELECT * FROM api_tokens WHERE user_id = ? ORDER BY id DESC'
  ).all(userId) as unknown as DbApiToken[];
}

export function deleteApiToken(id: number): boolean {
  const database = getDb();

  const token = database.prepare('SELECT * FROM api_tokens WHERE id = ?').get(id) as DbApiToken | undefined;

  if (!token) {
    return false;
  }

  database.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);

  return true;
}
