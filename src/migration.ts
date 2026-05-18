import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_TABLE = 'schema_migrations';

interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_initial_items_table',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,

          type TEXT NOT NULL DEFAULT 'url',
          title TEXT,
          url TEXT NOT NULL,

          host TEXT,
          owner TEXT,
          repo TEXT,

          status TEXT NOT NULL DEFAULT 'unread',
          tags TEXT,
          note TEXT,

          first_seen_at TEXT,
          last_seen_at TEXT,
          seen_count INTEGER NOT NULL DEFAULT 1
        );
      `);

      /**
       * 如果 items 表是旧版本已经存在的，
       * CREATE TABLE IF NOT EXISTS 不会补字段。
       * 所以这里再逐个补齐字段，避免旧数据结构缺字段。
       */
      addColumnIfNotExists(db, 'items', 'type', `TEXT NOT NULL DEFAULT 'url'`);
      addColumnIfNotExists(db, 'items', 'title', 'TEXT');
      addColumnIfNotExists(db, 'items', 'url', `TEXT NOT NULL DEFAULT ''`);

      addColumnIfNotExists(db, 'items', 'host', 'TEXT');
      addColumnIfNotExists(db, 'items', 'owner', 'TEXT');
      addColumnIfNotExists(db, 'items', 'repo', 'TEXT');

      addColumnIfNotExists(db, 'items', 'status', `TEXT NOT NULL DEFAULT 'unread'`);
      addColumnIfNotExists(db, 'items', 'tags', 'TEXT');
      addColumnIfNotExists(db, 'items', 'note', 'TEXT');

      addColumnIfNotExists(db, 'items', 'first_seen_at', 'TEXT');
      addColumnIfNotExists(db, 'items', 'last_seen_at', 'TEXT');
      addColumnIfNotExists(db, 'items', 'seen_count', 'INTEGER NOT NULL DEFAULT 1');

      /**
       * 补齐历史数据中可能为空的字段。
       */
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE items
        SET type = 'url'
        WHERE type IS NULL OR type = ''
      `).run();

      db.prepare(`
        UPDATE items
        SET status = 'unread'
        WHERE status IS NULL OR status = ''
      `).run();

      db.prepare(`
        UPDATE items
        SET seen_count = 1
        WHERE seen_count IS NULL OR seen_count < 1
      `).run();

      db.prepare(`
        UPDATE items
        SET first_seen_at = ?
        WHERE first_seen_at IS NULL OR first_seen_at = ''
      `).run(now);

      db.prepare(`
        UPDATE items
        SET last_seen_at = first_seen_at
        WHERE last_seen_at IS NULL OR last_seen_at = ''
      `).run();

      /**
       * 索引。
       *
       * url 唯一索引用于去重。
       * 如果你的历史数据里已经有重复 url，创建唯一索引会失败。
       * 所以这里先清理重复 URL，只保留最早那条 id。
       */
      removeDuplicateUrls(db);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_items_url_unique ON items(url);
        CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
        CREATE INDEX IF NOT EXISTS idx_items_host ON items(host);
        CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
        CREATE INDEX IF NOT EXISTS idx_items_last_seen_at ON items(last_seen_at);
      `);
    },
  },
  {
    version: 2,
    name: 'create_users_and_tokens_tables',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
      `);
    },
  },
];

export interface AppliedMigration {
  version: number;
  name: string;
}

export interface MigrationResult {
  applied: AppliedMigration[];
  backupPath: string | null;
}

export interface RunMigrationsOptions {
  db: DatabaseSync;
  dbPath?: string;
  dataDir?: string;
  backup?: boolean;
}

export function runMigrations({
  db,
  dbPath,
  dataDir,
  backup = true,
}: RunMigrationsOptions): MigrationResult {
  if (!db) {
    throw new Error('runMigrations requires db');
  }

  ensureMigrationsTable(db);

  const pendingMigrations = migrations.filter((migration) => {
    return !isMigrationApplied(db, migration.version);
  });

  if (pendingMigrations.length === 0) {
    return {
      applied: [],
      backupPath: null,
    };
  }

  let backupPath: string | null = null;

  if (backup) {
    backupPath = backupDatabase({
      dbPath,
      dataDir,
      reason: `before-migration-v${pendingMigrations[0]!.version}-to-v${pendingMigrations.at(-1)!.version}`,
    });
  }

  const applied: AppliedMigration[] = [];

  for (const migration of pendingMigrations) {
    applySingleMigration(db, migration);
    applied.push({
      version: migration.version,
      name: migration.name,
    });
  }

  return {
    applied,
    backupPath,
  };
}

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function isMigrationApplied(db: DatabaseSync, version: number): boolean {
  const row = db
    .prepare(`
      SELECT version
      FROM ${MIGRATIONS_TABLE}
      WHERE version = ?
    `)
    .get(version) as { version: number } | undefined;

  return Boolean(row);
}

function applySingleMigration(db: DatabaseSync, migration: Migration): void {
  console.log(`[migration] applying ${migration.version}: ${migration.name}`);

  db.exec('BEGIN IMMEDIATE');

  try {
    migration.up(db);

    db
      .prepare(`
        INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at)
        VALUES (?, ?, ?)
      `)
      .run(
        migration.version,
        migration.name,
        new Date().toISOString()
      );

    db.exec('COMMIT');

    console.log(`[migration] applied ${migration.version}: ${migration.name}`);
  } catch (error) {
    db.exec('ROLLBACK');

    console.error(`[migration] failed ${migration.version}: ${migration.name}`);
    throw error;
  }
}

function addColumnIfNotExists(db: DatabaseSync, tableName: string, columnName: string, columnDefinition: string): boolean {
  if (columnExists(db, tableName, columnName)) {
    return false;
  }

  assertSafeIdentifier(tableName);
  assertSafeIdentifier(columnName);

  db.exec(`
    ALTER TABLE ${tableName}
    ADD COLUMN ${columnName} ${columnDefinition}
  `);

  return true;
}

function columnExists(db: DatabaseSync, tableName: string, columnName: string): boolean {
  assertSafeIdentifier(tableName);

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

/**
 * 创建唯一 url 索引前，先处理重复 URL。
 *
 * 策略：
 * - 保留同一个 url 中 id 最小的一条
 * - 合并 seen_count
 * - last_seen_at 取最大值
 * - 删除其他重复项
 *
 * 这样不会完全丢失重复记录的"出现次数"和最近出现时间。
 */
function removeDuplicateUrls(db: DatabaseSync): void {
  const duplicates = db.prepare(`
    SELECT url
    FROM items
    WHERE url IS NOT NULL AND url != ''
    GROUP BY url
    HAVING COUNT(*) > 1
  `).all() as Array<{ url: string }>;

  for (const row of duplicates) {
    const url = row.url;

    const records = db.prepare(`
      SELECT *
      FROM items
      WHERE url = ?
      ORDER BY id ASC
    `).all(url) as Array<{ id: number; seen_count: number | null; last_seen_at: string | null }>;

    if (records.length <= 1) {
      continue;
    }

    const keeper = records[0]!;
    const rest = records.slice(1);

    const totalSeenCount = records.reduce((sum, item) => {
      return sum + Number(item.seen_count || 1);
    }, 0);

    const latestSeenAt = records
      .map((item) => item.last_seen_at)
      .filter(Boolean)
      .sort()
      .at(-1) || keeper.last_seen_at;

    db.prepare(`
      UPDATE items
      SET seen_count = ?,
          last_seen_at = ?
      WHERE id = ?
    `).run(
      totalSeenCount,
      latestSeenAt,
      keeper.id
    );

    const idsToDelete = rest.map((item) => item.id);

    const placeholders = idsToDelete.map(() => '?').join(', ');

    db.prepare(`
      DELETE FROM items
      WHERE id IN (${placeholders})
    `).run(...idsToDelete);

    console.log(`[migration] merged duplicate url: ${url}`);
  }
}

interface BackupDatabaseOptions {
  dbPath?: string | undefined;
  dataDir?: string | undefined;
  reason?: string;
}

function backupDatabase({
  dbPath,
  dataDir,
  reason = 'manual',
}: BackupDatabaseOptions): string | null {
  if (!dbPath) {
    throw new Error('backupDatabase requires dbPath');
  }

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const backupDir = path.join(dataDir || path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const dbBaseName = path.basename(dbPath);
  const backupBaseName = `${dbBaseName}.${timestamp}.${sanitizeFilePart(reason)}`;
  const backupMainPath = path.join(backupDir, backupBaseName);

  copyIfExists(dbPath, backupMainPath);
  copyIfExists(`${dbPath}-wal`, `${backupMainPath}-wal`);
  copyIfExists(`${dbPath}-shm`, `${backupMainPath}-shm`);

  console.log(`[db] backup created: ${backupMainPath}`);

  return backupMainPath;
}

function copyIfExists(from: string, to: string): void {
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
  }
}

function sanitizeFilePart(value: string): string {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}
