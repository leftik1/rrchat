import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { PROJECT_ROOT } from './config.js';

export interface ChatRecord {
  id: string;
  title: string;
  mode: string;
  model_id: string;
  guest_session_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRecord {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning: string | null;
  attachments: string | null; // JSON string
  stats: string | null;       // JSON string
  token_count?: number | null;
  excluded?: number;          // 0 or 1
  kind?: 'message' | 'marker' | 'summary';
  created_at: number;
}

export interface ContextOpRecord {
  id: string;
  chat_id: string;
  kind: string;
  message_ids: string; // JSON array
  created_at: number;
}

const DB_PATH = process.env.VITEST
  ? path.join(os.tmpdir(), `vitest_chats_${process.pid}.db`)
  : path.join(PROJECT_ROOT, 'chats.db');

let _db: Database.Database | null = null;

function initDb(): Database.Database {
  if (_db) return _db;

  const instance = new Database(DB_PATH);
  try {
    instance.pragma('journal_mode = WAL');
    instance.pragma('synchronous = NORMAL');
  } catch {
    // ignore pragma failure on read-only environments
  }

  // Initialize tables
  instance.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT,
      mode TEXT,
      model_id TEXT,
      guest_session_id TEXT DEFAULT NULL,
      created_at INT,
      updated_at INT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      role TEXT,
      content TEXT,
      reasoning TEXT,
      attachments TEXT,
      stats TEXT,
      token_count INT,
      excluded INT DEFAULT 0,
      kind TEXT DEFAULT 'message',
      created_at INT,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS context_ops (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      kind TEXT,
      message_ids TEXT,
      created_at INT,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INT,
      ip TEXT,
      event TEXT,
      details TEXT,
      session_id TEXT,
      user_agent TEXT,
      chat_id TEXT,
      tool TEXT,
      args TEXT,
      ok INT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      sid TEXT PRIMARY KEY,
      created_at INT,
      expires_at INT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      created_at INT,
      last_seen INT,
      user_agent TEXT,
      access_class TEXT,
      role TEXT DEFAULT 'admin',
      revoked INT DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_context_ops_chat ON context_ops(chat_id);
  `);

  // Migration for existing tables
  try {
    const pragma = instance.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
    const colNames = new Set(pragma.map((c) => c.name));
    if (!colNames.has('token_count')) {
      instance.exec("ALTER TABLE messages ADD COLUMN token_count INT;");
    }
    if (!colNames.has('excluded')) {
      instance.exec("ALTER TABLE messages ADD COLUMN excluded INT DEFAULT 0;");
    }
    if (!colNames.has('kind')) {
      instance.exec("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'message';");
    }

    const pragmaAudit = instance.prepare("PRAGMA table_info(audit_log)").all() as { name: string }[];
    const auditCols = new Set(pragmaAudit.map((c) => c.name));
    if (!auditCols.has('event')) {
      instance.exec(`
        DROP TABLE IF EXISTS audit_log_old;
        ALTER TABLE audit_log RENAME TO audit_log_old;
        CREATE TABLE audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INT,
          ip TEXT,
          event TEXT,
          details TEXT,
          session_id TEXT,
          user_agent TEXT
        );
        DROP TABLE IF EXISTS audit_log_old;
      `);
    } else {
      if (!auditCols.has('details')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN details TEXT;");
      }
      if (!auditCols.has('session_id')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN session_id TEXT;");
      }
      if (!auditCols.has('chat_id')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN chat_id TEXT;");
      }
      if (!auditCols.has('tool')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN tool TEXT;");
      }
      if (!auditCols.has('args')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN args TEXT;");
      }
      if (!auditCols.has('ok')) {
        instance.exec("ALTER TABLE audit_log ADD COLUMN ok INT;");
      }
    }

    const pragmaChats = instance.prepare("PRAGMA table_info(chats)").all() as { name: string }[];
    const chatCols = new Set(pragmaChats.map((c) => c.name));
    if (!chatCols.has('guest_session_id')) {
      instance.exec("ALTER TABLE chats ADD COLUMN guest_session_id TEXT DEFAULT NULL;");
    }

    const pragmaSessions = instance.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    const sessionCols = new Set(pragmaSessions.map((c) => c.name));
    if (!sessionCols.has('role')) {
      instance.exec("ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT 'admin';");
    }
  } catch {
    // pragma migration error ignored
  }

  _db = instance;
  return _db;
}

export function getDb(): Database.Database {
  return initDb();
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const realDb = initDb();
    const value = Reflect.get(realDb, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(realDb);
    }
    return value;
  },
  set(_target, prop, value, receiver) {
    const realDb = initDb();
    return Reflect.set(realDb, prop, value, receiver);
  },
});

export function getChats(guestSessionId?: string | null): ChatRecord[] {
  if (guestSessionId) {
    const stmt = db.prepare('SELECT * FROM chats WHERE guest_session_id = ? ORDER BY updated_at DESC');
    return stmt.all(guestSessionId) as ChatRecord[];
  }
  const stmt = db.prepare('SELECT * FROM chats WHERE guest_session_id IS NULL ORDER BY updated_at DESC');
  return stmt.all() as ChatRecord[];
}

export function getAllGuestChats(): ChatRecord[] {
  const stmt = db.prepare('SELECT * FROM chats WHERE guest_session_id IS NOT NULL ORDER BY updated_at DESC');
  return stmt.all() as ChatRecord[];
}

export function getChatById(id: string): ChatRecord | undefined {
  const stmt = db.prepare('SELECT * FROM chats WHERE id = ?');
  return stmt.get(id) as ChatRecord | undefined;
}

export function createChat(chat: { id: string; title: string; mode: string; model_id: string; guest_session_id?: string | null }): ChatRecord {
  const now = Date.now();
  const record: ChatRecord = {
    id: chat.id,
    title: chat.title,
    mode: chat.mode || 'chat',
    model_id: chat.model_id,
    guest_session_id: chat.guest_session_id || null,
    created_at: now,
    updated_at: now,
  };
  const stmt = db.prepare(`
    INSERT INTO chats (id, title, mode, model_id, guest_session_id, created_at, updated_at)
    VALUES (@id, @title, @mode, @model_id, @guest_session_id, @created_at, @updated_at)
  `);
  stmt.run(record);
  return record;
}

export function updateChat(id: string, updates: Partial<Pick<ChatRecord, 'title' | 'mode' | 'model_id'>>): void {
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.mode !== undefined) {
    fields.push('mode = ?');
    values.push(updates.mode);
  }
  if (updates.model_id !== undefined) {
    fields.push('model_id = ?');
    values.push(updates.model_id);
  }

  values.push(id);
  const stmt = db.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteChat(id: string): void {
  const delMsgs = db.prepare('DELETE FROM messages WHERE chat_id = ?');
  const delChat = db.prepare('DELETE FROM chats WHERE id = ?');
  delMsgs.run(id);
  delChat.run(id);
}

export function getMessages(chatId: string, includeExcluded = true): MessageRecord[] {
  const query = includeExcluded
    ? 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC'
    : 'SELECT * FROM messages WHERE chat_id = ? AND (excluded = 0 OR excluded IS NULL) ORDER BY created_at ASC';
  const stmt = db.prepare(query);
  return stmt.all(chatId) as MessageRecord[];
}

export function getActiveMessages(chatId: string): MessageRecord[] {
  return getMessages(chatId, false);
}

export function addMessage(msg: {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string | null;
  attachments?: any;
  stats?: any;
  token_count?: number | null;
  excluded?: number;
  kind?: 'message' | 'marker' | 'summary';
}): MessageRecord {
  const now = Date.now();
  const record: MessageRecord = {
    id: msg.id,
    chat_id: msg.chat_id,
    role: msg.role,
    content: msg.content,
    reasoning: msg.reasoning || null,
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
    stats: msg.stats ? JSON.stringify(msg.stats) : null,
    token_count: msg.token_count ?? null,
    excluded: msg.excluded ?? 0,
    kind: msg.kind || 'message',
    created_at: now,
  };

  const stmt = db.prepare(`
    INSERT INTO messages (id, chat_id, role, content, reasoning, attachments, stats, token_count, excluded, kind, created_at)
    VALUES (@id, @chat_id, @role, @content, @reasoning, @attachments, @stats, @token_count, @excluded, @kind, @created_at)
  `);
  stmt.run(record);

  // Update chat updated_at
  const updateStmt = db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?');
  updateStmt.run(now, msg.chat_id);

  return record;
}

export function updateMessage(id: string, content: string, reasoning?: string | null): void {
  const stmt = db.prepare('UPDATE messages SET content = ?, reasoning = ? WHERE id = ?');
  stmt.run(content, reasoning || null, id);
}

export function setMessageTokenCount(id: string, count: number): void {
  const stmt = db.prepare('UPDATE messages SET token_count = ? WHERE id = ?');
  stmt.run(count, id);
}

export function excludeMessages(chatId: string, messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(',');
  const stmt = db.prepare(`UPDATE messages SET excluded = 1 WHERE chat_id = ? AND id IN (${placeholders})`);
  stmt.run(chatId, ...messageIds);
}

export function unexcludeMessages(chatId: string, messageIds: string[]): void {
  if (messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(',');
  const stmt = db.prepare(`UPDATE messages SET excluded = 0 WHERE chat_id = ? AND id IN (${placeholders})`);
  stmt.run(chatId, ...messageIds);
}

export function recordContextOp(op: {
  id: string;
  chat_id: string;
  kind: string;
  message_ids: string[];
}): void {
  const stmt = db.prepare(`
    INSERT INTO context_ops (id, chat_id, kind, message_ids, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(op.id, op.chat_id, op.kind, JSON.stringify(op.message_ids), Date.now());
}

export function getLastContextOp(chatId: string): ContextOpRecord | undefined {
  const stmt = db.prepare('SELECT * FROM context_ops WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1');
  return stmt.get(chatId) as ContextOpRecord | undefined;
}

export function deleteContextOp(id: string): void {
  const stmt = db.prepare('DELETE FROM context_ops WHERE id = ?');
  stmt.run(id);
}

export function deleteMessagesAfter(chatId: string, timestamp: number): void {
  const stmt = db.prepare('DELETE FROM messages WHERE chat_id = ? AND created_at > ?');
  stmt.run(chatId, timestamp);
}

export function deleteMessage(chatId: string, messageId: string): void {
  const stmt = db.prepare('DELETE FROM messages WHERE chat_id = ? AND id = ?');
  stmt.run(chatId, messageId);
}

export type AuditEvent =
  | 'auth_success'
  | 'auth_fail'
  | 'auth_logout'
  | 'token_reset'
  | 'session_revoked'
  | 'command_run'
  | 'command_reject'
  | 'work_mode_toggle'
  | 'admin_access_denied';

export function recordAuditLog(
  event: AuditEvent | string,
  ip = '127.0.0.1',
  userAgent = '',
  details: any = {},
  sessionId = ''
): void {
  try {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
    db.prepare(`
      INSERT INTO audit_log (timestamp, ip, event, details, session_id, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Date.now(), ip, event, detailsStr, sessionId, userAgent);

    // Prune to maintain last 10,000 entries
    const countRow = db.prepare('SELECT count(*) as total FROM audit_log').get() as { total: number };
    if (countRow && countRow.total > 10500) {
      db.prepare(`
        DELETE FROM audit_log WHERE id NOT IN (
          SELECT id FROM audit_log ORDER BY id DESC LIMIT 10000
        )
      `).run();
    }
  } catch (err) {
    console.warn('[DB] Failed to record audit log:', err);
  }
}

export function getAuditLogs(limit = 100, offset = 0): Array<{
  id: number;
  timestamp: number;
  ip: string;
  event: string;
  details: string;
  session_id: string;
  user_agent: string;
}> {
  try {
    return db.prepare(`
      SELECT id, timestamp, ip, event, COALESCE(details, details_json) as details, session_id, user_agent
      FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];
  } catch {
    return [];
  }
}

export function logAudit(chatId: string, tool: string, args: string, ok: boolean): void {
  try {
    const detailsStr = JSON.stringify({ chatId, tool, args, ok });
    db.prepare(`
      INSERT INTO audit_log (timestamp, ip, event, details, session_id, user_agent, chat_id, tool, args, ok)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(Date.now(), '127.0.0.1', ok ? 'command_run' : 'command_reject', detailsStr, '', '', chatId, tool, args, ok ? 1 : 0);
  } catch (err) {
    console.warn('[DB] Failed to log audit:', err);
  }
}

export function saveDbSession(sid: string, expiresAt: number): void {
  try {
    db.prepare('INSERT OR REPLACE INTO auth_sessions (sid, created_at, expires_at) VALUES (?, ?, ?)').run(
      sid,
      Date.now(),
      expiresAt
    );
  } catch (err) {
    console.warn('[DB] Failed to save session:', err);
  }
}

export function isDbSessionValid(sid: string): boolean {
  try {
    const row = db.prepare('SELECT expires_at FROM auth_sessions WHERE sid = ?').get(sid) as { expires_at: number } | undefined;
    if (!row) return false;
    if (Date.now() > row.expires_at) {
      deleteDbSession(sid);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteDbSession(sid: string): void {
  try {
    db.prepare('DELETE FROM auth_sessions WHERE sid = ?').run(sid);
  } catch {
    // ignore
  }
}

export function clearAllDbSessions(): void {
  try {
    db.prepare('DELETE FROM auth_sessions').run();
  } catch {
    // ignore
  }
}

export interface SessionRecord {
  id_hash: string;
  created_at: number;
  last_seen: number;
  user_agent: string;
  access_class: string;
  role?: 'admin' | 'guest';
  revoked: number;
}

export function insertSession(session: SessionRecord): void {
  try {
    const rec = {
      ...session,
      role: session.role || 'admin',
    };
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id_hash, created_at, last_seen, user_agent, access_class, role, revoked)
      VALUES (@id_hash, @created_at, @last_seen, @user_agent, @access_class, @role, @revoked)
    `).run(rec);
  } catch (err) {
    console.warn('[DB] Failed to insert session:', err);
  }
}

export function revokeGuestSessionsDb(): void {
  try {
    db.prepare("UPDATE sessions SET revoked = 1 WHERE role = 'guest'").run();
  } catch (err) {
    console.warn('[DB] Failed to revoke guest sessions:', err);
  }
}

export function getSession(idHash: string): SessionRecord | undefined {
  try {
    return db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(idHash) as SessionRecord | undefined;
  } catch {
    return undefined;
  }
}

export function touchSession(idHash: string): void {
  try {
    db.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').run(Date.now(), idHash);
  } catch {
    // ignore
  }
}

export function revokeSessionDb(idHash: string): void {
  try {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE id_hash = ? OR id_hash LIKE ?').run(idHash, `${idHash}%`);
  } catch {
    // ignore
  }
}

export function revokeAllSessionsDb(): void {
  try {
    db.prepare('UPDATE sessions SET revoked = 1').run();
  } catch {
    // ignore
  }
}

export function getActiveSessionsDb(): SessionRecord[] {
  try {
    return db.prepare('SELECT * FROM sessions WHERE revoked = 0 ORDER BY last_seen DESC').all() as SessionRecord[];
  } catch {
    return [];
  }
}
