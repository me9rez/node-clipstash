#!/usr/bin/env node
import { typeFlag } from "type-flag";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import clipboard from "clipboardy";
import notifier from "node-notifier";
//#region src/migration.ts
const MIGRATIONS_TABLE = "schema_migrations";
const migrations = [{
	version: 1,
	name: "create_initial_items_table",
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
		addColumnIfNotExists(db, "items", "type", `TEXT NOT NULL DEFAULT 'url'`);
		addColumnIfNotExists(db, "items", "title", "TEXT");
		addColumnIfNotExists(db, "items", "url", `TEXT NOT NULL DEFAULT ''`);
		addColumnIfNotExists(db, "items", "host", "TEXT");
		addColumnIfNotExists(db, "items", "owner", "TEXT");
		addColumnIfNotExists(db, "items", "repo", "TEXT");
		addColumnIfNotExists(db, "items", "status", `TEXT NOT NULL DEFAULT 'unread'`);
		addColumnIfNotExists(db, "items", "tags", "TEXT");
		addColumnIfNotExists(db, "items", "note", "TEXT");
		addColumnIfNotExists(db, "items", "first_seen_at", "TEXT");
		addColumnIfNotExists(db, "items", "last_seen_at", "TEXT");
		addColumnIfNotExists(db, "items", "seen_count", "INTEGER NOT NULL DEFAULT 1");
		/**
		* 补齐历史数据中可能为空的字段。
		*/
		const now = (/* @__PURE__ */ new Date()).toISOString();
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
	}
}, {
	version: 2,
	name: "create_users_and_tokens_tables",
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
	}
}];
function runMigrations({ db, dbPath, dataDir, backup = true }) {
	if (!db) throw new Error("runMigrations requires db");
	ensureMigrationsTable(db);
	const pendingMigrations = migrations.filter((migration) => {
		return !isMigrationApplied(db, migration.version);
	});
	if (pendingMigrations.length === 0) return {
		applied: [],
		backupPath: null
	};
	let backupPath = null;
	if (backup) backupPath = backupDatabase({
		dbPath,
		dataDir,
		reason: `before-migration-v${pendingMigrations[0].version}-to-v${pendingMigrations.at(-1).version}`
	});
	const applied = [];
	for (const migration of pendingMigrations) {
		applySingleMigration(db, migration);
		applied.push({
			version: migration.version,
			name: migration.name
		});
	}
	return {
		applied,
		backupPath
	};
}
function ensureMigrationsTable(db) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}
function isMigrationApplied(db, version) {
	const row = db.prepare(`
      SELECT version
      FROM ${MIGRATIONS_TABLE}
      WHERE version = ?
    `).get(version);
	return Boolean(row);
}
function applySingleMigration(db, migration) {
	console.log(`[migration] applying ${migration.version}: ${migration.name}`);
	db.exec("BEGIN IMMEDIATE");
	try {
		migration.up(db);
		db.prepare(`
        INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, (/* @__PURE__ */ new Date()).toISOString());
		db.exec("COMMIT");
		console.log(`[migration] applied ${migration.version}: ${migration.name}`);
	} catch (error) {
		db.exec("ROLLBACK");
		console.error(`[migration] failed ${migration.version}: ${migration.name}`);
		throw error;
	}
}
function addColumnIfNotExists(db, tableName, columnName, columnDefinition) {
	if (columnExists(db, tableName, columnName)) return false;
	assertSafeIdentifier(tableName);
	assertSafeIdentifier(columnName);
	db.exec(`
    ALTER TABLE ${tableName}
    ADD COLUMN ${columnName} ${columnDefinition}
  `);
	return true;
}
function columnExists(db, tableName, columnName) {
	assertSafeIdentifier(tableName);
	return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
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
function removeDuplicateUrls(db) {
	const duplicates = db.prepare(`
    SELECT url
    FROM items
    WHERE url IS NOT NULL AND url != ''
    GROUP BY url
    HAVING COUNT(*) > 1
  `).all();
	for (const row of duplicates) {
		const url = row.url;
		const records = db.prepare(`
      SELECT *
      FROM items
      WHERE url = ?
      ORDER BY id ASC
    `).all(url);
		if (records.length <= 1) continue;
		const keeper = records[0];
		const rest = records.slice(1);
		const totalSeenCount = records.reduce((sum, item) => {
			return sum + Number(item.seen_count || 1);
		}, 0);
		const latestSeenAt = records.map((item) => item.last_seen_at).filter(Boolean).sort().at(-1) || keeper.last_seen_at;
		db.prepare(`
      UPDATE items
      SET seen_count = ?,
          last_seen_at = ?
      WHERE id = ?
    `).run(totalSeenCount, latestSeenAt, keeper.id);
		const idsToDelete = rest.map((item) => item.id);
		const placeholders = idsToDelete.map(() => "?").join(", ");
		db.prepare(`
      DELETE FROM items
      WHERE id IN (${placeholders})
    `).run(...idsToDelete);
		console.log(`[migration] merged duplicate url: ${url}`);
	}
}
function backupDatabase({ dbPath, dataDir, reason = "manual" }) {
	if (!dbPath) throw new Error("backupDatabase requires dbPath");
	if (!fs.existsSync(dbPath)) return null;
	const backupDir = path.join(dataDir || path.dirname(dbPath), "backups");
	fs.mkdirSync(backupDir, { recursive: true });
	const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
	const backupBaseName = `${path.basename(dbPath)}.${timestamp}.${sanitizeFilePart(reason)}`;
	const backupMainPath = path.join(backupDir, backupBaseName);
	copyIfExists(dbPath, backupMainPath);
	copyIfExists(`${dbPath}-wal`, `${backupMainPath}-wal`);
	copyIfExists(`${dbPath}-shm`, `${backupMainPath}-shm`);
	console.log(`[db] backup created: ${backupMainPath}`);
	return backupMainPath;
}
function copyIfExists(from, to) {
	if (fs.existsSync(from)) fs.copyFileSync(from, to);
}
function sanitizeFilePart(value) {
	return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}
function assertSafeIdentifier(identifier) {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
}
//#endregion
//#region src/db.ts
const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "clipmark.db");
let db;
function initDb() {
	if (db) return db;
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
		backup: true
	});
	if (result.applied.length > 0) console.log("[migration] summary:", result.applied);
	return db;
}
function getDb() {
	if (!db) initDb();
	return db;
}
function saveItem(item) {
	const database = getDb();
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const existing = database.prepare("SELECT * FROM items WHERE url = ?").get(item.url);
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
				seen_count: Number(existing.seen_count || 1) + 1
			}
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
  `).run(item.type, item.title ?? null, item.url, item.host ?? null, item.owner ?? null, item.repo ?? null, now, now);
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
			status: "unread",
			tags: null,
			note: null,
			first_seen_at: now,
			last_seen_at: now,
			seen_count: 1
		}
	};
}
function listItems({ limit = 50, offset = 0, type, status, q } = {}) {
	const database = getDb();
	const where = [];
	const queryParams = {};
	const listParams = {
		"@limit": limit,
		"@offset": offset
	};
	if (type && type !== "all") {
		where.push("type = @type");
		queryParams["@type"] = type;
		listParams["@type"] = type;
	}
	if (status && status !== "all") {
		where.push("status = @status");
		queryParams["@status"] = status;
		listParams["@status"] = status;
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
		queryParams["@q"] = keyword;
		listParams["@q"] = keyword;
	}
	const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
	return {
		items: database.prepare(`
    SELECT *
    FROM items
    ${whereSql}
    ORDER BY last_seen_at DESC
    LIMIT @limit OFFSET @offset
  `).all(listParams),
		total: database.prepare(`
    SELECT COUNT(*) AS count
    FROM items
    ${whereSql}
  `).get(queryParams)?.count ?? 0,
		limit,
		offset
	};
}
function getItemById(id) {
	return getDb().prepare(`
    SELECT *
    FROM items
    WHERE id = ?
  `).get(id);
}
function updateItem(id, patch) {
	const database = getDb();
	const allowedFields = [
		"title",
		"status",
		"tags",
		"note"
	];
	const entries = Object.entries(patch).filter(([key]) => allowedFields.includes(key));
	if (entries.length === 0) return getItemById(id);
	const sets = [];
	const params = { "@id": id };
	for (const [key, value] of entries) {
		const paramName = `@${key}`;
		sets.push(`${key} = ${paramName}`);
		params[paramName] = value;
	}
	database.prepare(`
    UPDATE items
    SET ${sets.join(", ")}
    WHERE id = @id
  `).run(params);
	return getItemById(id);
}
function deleteItem(id) {
	const database = getDb();
	if (!getItemById(id)) return false;
	database.prepare(`
    DELETE FROM items
    WHERE id = ?
  `).run(id);
	return true;
}
function getStats() {
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
		byStatus
	};
}
function hasUsers() {
	return getDb().prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
}
function createUser(username, passwordHash, isAdmin = false) {
	const database = getDb();
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const result = database.prepare(`
    INSERT INTO users (username, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, isAdmin ? 1 : 0, now);
	return {
		id: Number(result.lastInsertRowid),
		username,
		password_hash: passwordHash,
		is_admin: isAdmin ? 1 : 0,
		created_at: now
	};
}
function findUserByToken(token) {
	return getDb().prepare(`
    SELECT u.*, t.id AS token_id
    FROM api_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token = ?
  `).get(token);
}
function findUserByUsername(username) {
	return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username);
}
function findUserById(id) {
	return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}
function createApiToken(userId, token, name) {
	const database = getDb();
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const result = database.prepare(`
    INSERT INTO api_tokens (user_id, token, name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, token, name, now);
	return {
		id: Number(result.lastInsertRowid),
		user_id: userId,
		token,
		name,
		created_at: now
	};
}
function listUsers() {
	return getDb().prepare("SELECT * FROM users ORDER BY id ASC").all();
}
function deleteUser(id) {
	const database = getDb();
	if (!findUserById(id)) return false;
	database.prepare("DELETE FROM users WHERE id = ?").run(id);
	return true;
}
function updateUserPassword(id, passwordHash) {
	const database = getDb();
	if (!findUserById(id)) return false;
	database.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
	return true;
}
function listApiTokens(userId) {
	return getDb().prepare("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY id DESC").all(userId);
}
function deleteApiToken(id) {
	const database = getDb();
	if (!database.prepare("SELECT * FROM api_tokens WHERE id = ?").get(id)) return false;
	database.prepare("DELETE FROM api_tokens WHERE id = ?").run(id);
	return true;
}
//#endregion
//#region src/auth.ts
function hashPassword(password) {
	const salt = randomBytes(16).toString("hex");
	return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, stored) {
	const parts = stored.split(":");
	if (parts.length !== 2) return false;
	const salt = parts[0];
	const hash = parts[1];
	const derived = scryptSync(password, salt, 64);
	const expected = Buffer.from(hash, "hex");
	if (derived.length !== expected.length) return false;
	return timingSafeEqual(derived, expected);
}
function generateToken() {
	return randomBytes(32).toString("hex");
}
const authMiddleware = async (c, next) => {
	const header = c.req.header("Authorization");
	if (!header || !header.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
	const token = header.slice(7).trim();
	if (!token) return c.json({ error: "Unauthorized" }, 401);
	const user = findUserByToken(token);
	if (!user) return c.json({ error: "Invalid token" }, 401);
	c.set("userId", user.id);
	c.set("user", {
		id: user.id,
		is_admin: user.is_admin
	});
	await next();
};
const requireAdmin = async (c, next) => {
	const user = c.get("user");
	if (!user || !user.is_admin) return c.json({ error: "Forbidden" }, 403);
	await next();
};
//#endregion
//#region src/server.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "../web/dist");
function createApp() {
	initDb();
	const app = new Hono();
	const corsOrigin = process.env.CLIPSTASH_CORS_ORIGIN || "";
	const corsOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
	if (corsOrigin) corsOrigins.push(corsOrigin);
	app.use("/api/*", cors({
		origin: corsOrigins,
		allowMethods: [
			"GET",
			"POST",
			"PATCH",
			"DELETE",
			"OPTIONS"
		],
		allowHeaders: ["Content-Type", "Authorization"]
	}));
	app.get("/api/health", (c) => {
		return c.json({
			ok: true,
			name: "clipstash",
			time: (/* @__PURE__ */ new Date()).toISOString()
		});
	});
	app.post("/api/auth/login", async (c) => {
		const body = await safeJson(c);
		const username = typeof body.username === "string" ? body.username.trim() : "";
		const password = typeof body.password === "string" ? body.password : "";
		if (!username || !password) return c.json({ error: "Username and password are required" }, 400);
		const user = findUserByUsername(username);
		if (!user || !verifyPassword(password, user.password_hash)) return c.json({ error: "Invalid username or password" }, 401);
		const existingLoginToken = listApiTokens(user.id).find((t) => t.name.startsWith("Web login"));
		if (existingLoginToken) return c.json({
			token: existingLoginToken.token,
			user: {
				id: user.id,
				username: user.username,
				is_admin: Boolean(user.is_admin),
				created_at: user.created_at
			}
		});
		const token = generateToken();
		createApiToken(user.id, token, "Web login");
		return c.json({
			token,
			user: {
				id: user.id,
				username: user.username,
				is_admin: Boolean(user.is_admin),
				created_at: user.created_at
			}
		});
	});
	app.get("/api/auth/me", authMiddleware, (c) => {
		const user = findUserById(c.get("userId"));
		if (!user) return c.json({ error: "User not found" }, 404);
		return c.json({
			id: user.id,
			username: user.username,
			is_admin: Boolean(user.is_admin),
			created_at: user.created_at
		});
	});
	app.post("/api/auth/change-password", authMiddleware, async (c) => {
		const userId = c.get("userId");
		const body = await safeJson(c);
		const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
		const newPassword = typeof body.new_password === "string" ? body.new_password : "";
		if (!currentPassword || !newPassword) return c.json({ error: "Current password and new password are required" }, 400);
		if (newPassword.length < 6) return c.json({ error: "New password must be at least 6 characters" }, 400);
		const user = findUserById(userId);
		if (!user || !verifyPassword(currentPassword, user.password_hash)) return c.json({ error: "Current password is incorrect" }, 401);
		updateUserPassword(userId, hashPassword(newPassword));
		return c.json({ ok: true });
	});
	app.get("/api/stats", authMiddleware, (c) => {
		return c.json(getStats());
	});
	app.get("/api/items", authMiddleware, (c) => {
		const query = c.req.query();
		const result = listItems({
			limit: clampInt(query.limit, 1, 200, 50),
			offset: clampInt(query.offset, 0, 1e6, 0),
			type: query.type || "all",
			status: query.status || "all",
			q: query.q || ""
		});
		return c.json(result);
	});
	app.post("/api/items", authMiddleware, async (c) => {
		const body = await safeJson(c);
		const reqType = typeof body.type === "string" ? body.type : "";
		const title = typeof body.title === "string" ? body.title.trim() : "";
		const url = typeof body.url === "string" ? body.url.trim() : "";
		const host = typeof body.host === "string" ? body.host.trim() : "";
		const owner = typeof body.owner === "string" ? body.owner.trim() : "";
		const repo = typeof body.repo === "string" ? body.repo.trim() : "";
		if (!url || !host) return c.json({ error: "url and host are required" }, 400);
		if (reqType !== "github-repo" && reqType !== "url") return c.json({ error: "type must be \"github-repo\" or \"url\"" }, 400);
		const result = saveItem({
			type: reqType,
			title: title || url,
			url,
			host,
			owner: owner || null,
			repo: repo || null
		});
		return c.json(result);
	});
	app.get("/api/items/:id", authMiddleware, (c) => {
		const item = getItemById(Number(c.req.param("id")));
		if (!item) return c.json({ error: "Item not found" }, 404);
		return c.json(item);
	});
	app.patch("/api/items/:id", authMiddleware, async (c) => {
		const id = Number(c.req.param("id"));
		const body = await safeJson(c);
		if (!getItemById(id)) return c.json({ error: "Item not found" }, 404);
		const patch = {};
		if (typeof body.title === "string") patch.title = body.title.trim();
		if (typeof body.status === "string") {
			if (![
				"unread",
				"read",
				"archived"
			].includes(body.status)) return c.json({ error: "Invalid status" }, 400);
			patch.status = body.status;
		}
		if (typeof body.tags === "string") patch.tags = body.tags.trim();
		if (typeof body.note === "string") patch.note = body.note.trim();
		const updated = updateItem(id, patch);
		return c.json(updated);
	});
	app.delete("/api/items/:id", authMiddleware, (c) => {
		if (!deleteItem(Number(c.req.param("id")))) return c.json({ error: "Item not found" }, 404);
		return c.json({ ok: true });
	});
	app.get("/api/users", authMiddleware, requireAdmin, (c) => {
		const users = listUsers().map((u) => ({
			id: u.id,
			username: u.username,
			is_admin: Boolean(u.is_admin),
			created_at: u.created_at
		}));
		return c.json(users);
	});
	app.post("/api/users", authMiddleware, requireAdmin, async (c) => {
		const body = await safeJson(c);
		const username = typeof body.username === "string" ? body.username.trim() : "";
		const password = typeof body.password === "string" ? body.password : "";
		if (!username) return c.json({ error: "Username is required" }, 400);
		if (!password || password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);
		if (findUserByUsername(username)) return c.json({ error: "Username already exists" }, 409);
		const user = createUser(username, hashPassword(password), false);
		return c.json({
			id: user.id,
			username: user.username,
			is_admin: false,
			created_at: user.created_at
		}, 201);
	});
	app.patch("/api/users/:id", authMiddleware, requireAdmin, async (c) => {
		const id = Number(c.req.param("id"));
		const body = await safeJson(c);
		const password = typeof body.password === "string" ? body.password : "";
		if (!password || password.length < 6) return c.json({ error: "Password must be at least 6 characters" }, 400);
		if (!findUserById(id)) return c.json({ error: "User not found" }, 404);
		updateUserPassword(id, hashPassword(password));
		return c.json({ ok: true });
	});
	app.delete("/api/users/:id", authMiddleware, requireAdmin, (c) => {
		const id = Number(c.req.param("id"));
		if (id === c.get("userId")) return c.json({ error: "Cannot delete yourself" }, 400);
		const targetUser = findUserById(id);
		if (!targetUser) return c.json({ error: "User not found" }, 404);
		if (targetUser.username === "admin") return c.json({ error: "Cannot delete admin user" }, 403);
		deleteUser(id);
		return c.json({ ok: true });
	});
	app.get("/api/tokens", authMiddleware, (c) => {
		const tokens = listApiTokens(c.get("userId")).map((t) => ({
			id: t.id,
			token: t.token,
			name: t.name,
			created_at: t.created_at
		}));
		return c.json(tokens);
	});
	app.post("/api/tokens", authMiddleware, async (c) => {
		const userId = c.get("userId");
		const body = await safeJson(c);
		const name = typeof body.name === "string" ? body.name.trim() : "Unnamed token";
		const result = createApiToken(userId, generateToken(), name);
		return c.json({
			id: result.id,
			token: result.token,
			name: result.name,
			created_at: result.created_at
		}, 201);
	});
	app.delete("/api/tokens/:id", authMiddleware, (c) => {
		const userId = c.get("userId");
		const id = Number(c.req.param("id"));
		const targetToken = listApiTokens(userId).find((t) => t.id === id);
		if (!targetToken) return c.json({ error: "Token not found" }, 404);
		if (targetToken.name.startsWith("Web login")) return c.json({ error: "Cannot delete Web login token" }, 403);
		deleteApiToken(id);
		return c.json({ ok: true });
	});
	app.use("/*", serveStatic({ root: DIST_DIR }));
	app.get("*", serveStatic({ path: path.join(DIST_DIR, "index.html") }));
	return app;
}
function startServer(port) {
	const resolvedPort = port ?? Number(process.env.CLIPSTASH_PORT || 3879);
	serve({
		fetch: createApp().fetch,
		port: resolvedPort
	}, (info) => {
		console.log(`Clipstash API: http://localhost:${info.port}`);
		console.log(`Clipstash Web UI: http://localhost:${info.port}`);
		if (!hasUsers()) {
			const password = generateToken().slice(0, 16);
			const user = createUser("admin", hashPassword(password), true);
			const token = generateToken();
			createApiToken(user.id, token, "Bootstrap admin token");
			console.log("");
			console.log("=== 首次启动 — 管理员凭据 ===");
			console.log(`用户名: admin`);
			console.log(`密码:   ${password}`);
			console.log(`令牌:   ${token}`);
			console.log("请立即登录 WebUI 修改密码！");
			console.log("==============================");
			console.log("");
		}
	});
}
function clampInt(value, min, max, fallback) {
	const number = Number(value);
	if (!Number.isInteger(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}
async function safeJson(c) {
	try {
		return await c.req.json();
	} catch {
		return {};
	}
}
//#endregion
//#region src/parser.ts
const IGNORED_GITHUB_OWNERS = new Set([
	"features",
	"topics",
	"collections",
	"trending",
	"marketplace",
	"login",
	"signup",
	"settings",
	"notifications",
	"explore",
	"pricing",
	"about"
]);
function parseClipboardText(text) {
	const raw = String(text || "").trim();
	if (!raw) return null;
	const sshGitHub = parseGitHubSshUrl(raw);
	if (sshGitHub) return sshGitHub;
	const url = extractFirstUrl(raw);
	if (!url) return null;
	return parseUrl(url);
}
function extractFirstUrl(text) {
	const match = text.match(/https?:\/\/[^\s"'<>]+/i);
	return match ? match[0] : null;
}
function parseGitHubSshUrl(text) {
	const match = text.match(/^git@github\.com:([^\/\s]+)\/([^\/\s]+?)(?:\.git)?$/i);
	if (!match) return null;
	const owner = match[1];
	const repo = cleanupRepoName(match[2]);
	return {
		type: "github-repo",
		title: `${owner}/${repo}`,
		url: `https://github.com/${owner}/${repo}`,
		host: "github.com",
		owner,
		repo
	};
}
function parseUrl(input) {
	let url;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	if (!["http:", "https:"].includes(url.protocol)) return null;
	url.hash = "";
	if (isGitHubHost(url.hostname)) {
		const repo = parseGitHubRepoUrl(url);
		if (repo) return repo;
	}
	return {
		type: "url",
		title: guessTitleFromUrl(url),
		url: url.toString(),
		host: url.hostname,
		owner: null,
		repo: null
	};
}
function isGitHubHost(hostname) {
	return hostname === "github.com" || hostname === "www.github.com";
}
function parseGitHubRepoUrl(url) {
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length < 2) return null;
	const owner = parts[0];
	const repo = cleanupRepoName(parts[1]);
	if (!owner || !repo) return null;
	if (IGNORED_GITHUB_OWNERS.has(owner)) return null;
	return {
		type: "github-repo",
		title: `${owner}/${repo}`,
		url: `https://github.com/${owner}/${repo}`,
		host: "github.com",
		owner,
		repo
	};
}
function cleanupRepoName(repo) {
	return repo.replace(/\.git$/i, "");
}
function guessTitleFromUrl(url) {
	const last = url.pathname.split("/").filter(Boolean).at(-1);
	if (!last) return url.hostname;
	return decodeURIComponent(last).replace(/[-_]+/g, " ").trim() || url.hostname;
}
//#endregion
//#region src/watcher.ts
function startClipboardWatcher(onItem, { interval = 1e3 } = {}) {
	let lastText = "";
	let timer = null;
	let busy = false;
	async function tick() {
		if (busy) return;
		busy = true;
		try {
			const text = await clipboard.read();
			if (!text || text === lastText) return;
			lastText = text;
			const parsed = parseClipboardText(text);
			if (!parsed) return;
			await onItem(parsed);
		} catch (error) {
			console.error("[watcher:error]", error.message);
		} finally {
			busy = false;
		}
	}
	timer = setInterval(tick, interval);
	tick();
	return () => {
		if (timer) clearInterval(timer);
	};
}
//#endregion
//#region src/notify.ts
function notifySaved(item) {
	notifier.notify({
		title: item.type === "github-repo" ? "已收藏 GitHub 仓库" : "已收藏链接",
		message: item.title || item.url || "",
		wait: false,
		sound: false
	});
}
function notifyDuplicate(item) {
	notifier.notify({
		title: "已存在",
		message: `${item.title || item.url || ""} 已收藏过`,
		wait: false,
		sound: false
	});
}
function notifyError(title, message) {
	notifier.notify({
		title,
		message,
		wait: false,
		sound: false
	});
}
//#endregion
//#region src/client.ts
async function startClient({ serverUrl, token, notify = true }) {
	const baseUrl = serverUrl.replace(/\/+$/, "");
	console.log(`Connecting to: ${baseUrl}`);
	try {
		if (!(await fetch(`${baseUrl}/api/health`)).ok) {
			console.error("Server health check failed");
			process.exit(1);
		}
		console.log("Server is healthy");
	} catch (err) {
		console.error("Cannot reach server:", err.message);
		process.exit(1);
	}
	try {
		const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
		if (!meRes.ok) {
			const data = await meRes.json().catch(() => ({}));
			console.error(`Auth failed: ${data.error || meRes.statusText}`);
			process.exit(1);
		}
		const user = await meRes.json();
		console.log(`Authenticated as: ${user.username}`);
	} catch (err) {
		console.error("Auth check failed:", err.message);
		process.exit(1);
	}
	let stopping = false;
	async function pushItem(parsed) {
		if (!parsed || stopping) return;
		try {
			const res = await fetch(`${baseUrl}/api/items`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(parsed)
			});
			if (!res.ok) {
				const msg = (await res.json().catch(() => ({}))).error || `API error: ${res.status}`;
				console.error(`[push:error] ${parsed.url} — ${msg}`);
				if (notify) notifyError("推送失败", `${parsed.title || parsed.url}: ${msg}`);
				return;
			}
			const result = await res.json();
			if (result.created) {
				console.log(`[saved] ${parsed.type} ${parsed.url}`);
				if (notify) notifySaved(result.item);
			} else {
				console.log(`[exists] ${parsed.type} ${parsed.url}`);
				if (notify) notifyDuplicate(result.item);
			}
		} catch (err) {
			const msg = err.message;
			console.error(`[push:error] ${parsed.url} — ${msg}`);
			if (notify) notifyError("推送失败", `${parsed.title || parsed.url}: ${msg}`);
		}
	}
	const stop = startClipboardWatcher(pushItem);
	console.log("Watching clipboard... (Ctrl+C to stop)");
	function cleanup() {
		stopping = true;
		stop();
		console.log("\nClipstash client stopped.");
		process.exit(0);
	}
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
}
async function listRemoteItems({ serverUrl, token }) {
	const baseUrl = serverUrl.replace(/\/+$/, "");
	try {
		const res = await fetch(`${baseUrl}/api/items?limit=1000`, { headers: { Authorization: `Bearer ${token}` } });
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || `API error: ${res.status}`);
		}
		const result = await res.json();
		if (result.items.length === 0) console.log("No items found.");
		else console.table(result.items);
		console.log(`Total: ${result.total}`);
	} catch (err) {
		console.error("Failed to list items:", err.message);
		process.exit(1);
	}
}
//#endregion
//#region src/cli.ts
const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);
function printUsage() {
	console.log(`
Clipstash — 剪贴板收藏工具

用法:
  clipstash server   [--port <port>]                     启动 API 服务端 + WebUI
  clipstash client   [--server <url>] [--token <tok>]    启动剪贴板监听客户端
  clipstash list     [--server <url>] [--token <tok>]    列出收藏条目
  clipstash admin    <subcommand>                        管理用户和令牌

选项:
  --server, -s  <url>    服务端地址 (默认: env CLIPSTASH_SERVER_URL 或 http://127.0.0.1:3879)
  --token, -t   <tok>    认证令牌 (默认: env CLIPSTASH_TOKEN)
  --port, -p    <port>   服务端端口 (默认: env CLIPSTASH_PORT 或 3879)
  --no-notify            禁用桌面通知
  --help, -h             显示帮助
`);
}
function printAdminUsage() {
	console.log(`
clipstash admin — 用户和令牌管理

用法:
  clipstash admin list                    列出所有用户和令牌
  clipstash admin reset <username>        重置用户密码
  clipstash admin token <username> [name] 为用户生成新令牌

选项:
  --help, -h             显示帮助
`);
}
async function main() {
	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(command ? 0 : 1);
	}
	switch (command) {
		case "server": {
			const parsed = typeFlag({ port: {
				type: String,
				default: process.env.CLIPSTASH_PORT ?? "3879",
				alias: "p"
			} }, commandArgs);
			const port = parseInt(parsed.flags.port, 10);
			if (isNaN(port) || port < 1 || port > 65535) {
				console.error("Invalid port number");
				process.exit(1);
			}
			startServer(port);
			break;
		}
		case "client": {
			const parsed = typeFlag({
				server: {
					type: String,
					default: process.env.CLIPSTASH_SERVER_URL ?? "http://127.0.0.1:3879",
					alias: "s"
				},
				token: {
					type: String,
					default: process.env.CLIPSTASH_TOKEN ?? "",
					alias: "t"
				},
				"no-notify": {
					type: Boolean,
					default: false
				}
			}, commandArgs);
			const serverUrl = parsed.flags.server;
			const token = parsed.flags.token;
			if (!token) {
				console.error("Token is required. Set --token or CLIPSTASH_TOKEN env var.");
				process.exit(1);
			}
			if (!serverUrl) {
				console.error("Server URL is required. Set --server or CLIPSTASH_SERVER_URL env var.");
				process.exit(1);
			}
			await startClient({
				serverUrl,
				token,
				notify: !parsed.flags["no-notify"]
			});
			break;
		}
		case "list": {
			const parsed = typeFlag({
				server: {
					type: String,
					default: process.env.CLIPSTASH_SERVER_URL ?? "",
					alias: "s"
				},
				token: {
					type: String,
					default: process.env.CLIPSTASH_TOKEN ?? "",
					alias: "t"
				}
			}, commandArgs);
			const serverUrl = parsed.flags.server;
			const token = parsed.flags.token;
			if (serverUrl && token) await listRemoteItems({
				serverUrl,
				token
			});
			else {
				initDb();
				const result = listItems({ limit: 1e3 });
				console.table(result.items);
				console.log(`Total: ${result.total}`);
			}
			break;
		}
		case "admin": {
			const subcommand = commandArgs[0];
			if (!subcommand || subcommand === "--help" || subcommand === "-h") {
				printAdminUsage();
				process.exit(subcommand ? 0 : 1);
			}
			initDb();
			switch (subcommand) {
				case "list": {
					const users = listUsers();
					if (users.length === 0) {
						console.log("暂无用户。");
						break;
					}
					console.log("用户列表:");
					for (const user of users) {
						const tokens = listApiTokens(user.id);
						const role = user.is_admin ? "(管理员)" : "";
						console.log(`  ${user.username} ${role} 创建于 ${user.created_at.slice(0, 10)}`);
						if (tokens.length === 0) console.log("    (无令牌)");
						else for (const t of tokens) {
							const masked = t.token.slice(0, 12) + "..." + t.token.slice(-4);
							console.log(`    - ${t.name}: ${masked}`);
						}
					}
					break;
				}
				case "reset": {
					const username = commandArgs[1];
					if (!username) {
						console.error("请指定用户名: clipstash admin reset <username>");
						process.exit(1);
					}
					const user = findUserByUsername(username);
					if (!user) {
						console.error(`用户 "${username}" 不存在`);
						process.exit(1);
					}
					const newPassword = generateToken().slice(0, 16);
					const passwordHash = hashPassword(newPassword);
					updateUserPassword(user.id, passwordHash);
					console.log(`用户 ${username} 密码已重置:`);
					console.log(`  新密码: ${newPassword}`);
					console.log("  请使用新密码登录 WebUI");
					break;
				}
				case "token": {
					const username = commandArgs[1];
					const name = commandArgs[2] || "CLI generated token";
					if (!username) {
						console.error("请指定用户名: clipstash admin token <username> [name]");
						process.exit(1);
					}
					const user = findUserByUsername(username);
					if (!user) {
						console.error(`用户 "${username}" 不存在`);
						process.exit(1);
					}
					const token = generateToken();
					createApiToken(user.id, token, name);
					console.log(`为用户 ${username} 生成令牌 "${name}":`);
					console.log(`  令牌: ${token}`);
					console.log("  请立即复制并保存，关闭后无法再次查看");
					break;
				}
				default:
					console.error(`未知子命令: ${subcommand}`);
					printAdminUsage();
					process.exit(1);
			}
			break;
		}
		default:
			console.error(`Unknown command: ${command}`);
			printUsage();
			process.exit(1);
	}
}
main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
//#endregion
export {};
