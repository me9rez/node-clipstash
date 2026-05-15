import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migration.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'clipmark.db');

let db;

export function initDb() {
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

export function getDb() {
  if (!db) {
    initDb();
  }

  return db;
}

export function saveItem(item) {
  const database = getDb();
  const now = new Date().toISOString();

  const existing = database
    .prepare('SELECT * FROM items WHERE url = ?')
    .get(item.url);

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
      ...item,
      status: 'unread',
      tags: null,
      note: null,
      first_seen_at: now,
      last_seen_at: now,
      seen_count: 1,
    },
  };
}

export function listItems({ limit = 50, offset = 0, type, status, q } = {}) {
  const database = getDb();

  const where = [];
  const queryParams = {};
  const listParams = {
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
  `).all(listParams);

  const totalRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM items
    ${whereSql}
  `).get(queryParams);

  return {
    items,
    total: totalRow?.count ?? 0,
    limit,
    offset,
  };
}

export function getItemById(id) {
  const database = getDb();

  return database.prepare(`
    SELECT *
    FROM items
    WHERE id = ?
  `).get(id);
}

export function updateItem(id, patch) {
  const database = getDb();

  const allowedFields = ['title', 'status', 'tags', 'note'];
  const entries = Object.entries(patch)
    .filter(([key]) => allowedFields.includes(key));

  if (entries.length === 0) {
    return getItemById(id);
  }

  const sets = [];
  const params = {
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

export function deleteItem(id) {
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

export function getStats() {
  const database = getDb();

  const totalRow = database.prepare(`
    SELECT COUNT(*) AS count
    FROM items
  `).get();

  const byType = database.prepare(`
    SELECT type, COUNT(*) AS count
    FROM items
    GROUP BY type
    ORDER BY count DESC
  `).all();

  const byStatus = database.prepare(`
    SELECT status, COUNT(*) AS count
    FROM items
    GROUP BY status
    ORDER BY count DESC
  `).all();

  return {
    total: totalRow?.count ?? 0,
    byType,
    byStatus,
  };
}