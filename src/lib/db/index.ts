import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

/**
 * Seeded cafe admin for local/demo ops.
 * Creds live only in env / README — never on public UI.
 * Default email uses a normal TLD so browser email validation does not block login.
 */
export const SEED_ADMIN = {
  email: (process.env.ADMIN_EMAIL || "cafe.admin@example.com").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD?.trim() || "",
  name: process.env.ADMIN_NAME || "Cafe Admin",
};

const globalForDb = globalThis as unknown as {
  __menuMatchDb?: ReturnType<typeof drizzle<typeof schema>>;
  __menuMatchSqlite?: Database.Database;
  __menuMatchSeeded?: boolean;
};

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preference_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      diet_type TEXT NOT NULL DEFAULT 'non_veg',
      hard_avoids_json TEXT NOT NULL DEFAULT '[]',
      soft_dislikes_json TEXT NOT NULL DEFAULT '[]',
      likes_json TEXT NOT NULL DEFAULT '[]',
      goals_json TEXT NOT NULL DEFAULT '[]',
      allergies_json TEXT NOT NULL DEFAULT '[]',
      freeform_notes TEXT NOT NULL DEFAULT '',
      ai_interpretation_json TEXT,
      user_facing_summary TEXT NOT NULL DEFAULT '',
      email_enabled INTEGER NOT NULL DEFAULT 0,
      email_time_local TEXT NOT NULL DEFAULT '07:00',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temporary_restrictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      avoid_tags_json TEXT NOT NULL DEFAULT '[]',
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS menu_days (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      source_image_path TEXT,
      raw_model_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      menu_day_id TEXT NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
      meal TEXT NOT NULL,
      station TEXT NOT NULL,
      name TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_day_id TEXT NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
      verdict TEXT NOT NULL,
      score INTEGER NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS digest_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_day_id TEXT NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'in_app',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dish_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_day_id TEXT NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
      dish_name TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_match_user_menu
      ON match_results(user_id, menu_day_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user_menu
      ON dish_feedback(user_id, menu_day_id);
  `);
}

/**
 * Ensures a known cafe-admin account exists so ops never depend on
 * "first registrant" luck. Password is reset to seed value on each boot
 * (local hackday / demo). Override with ADMIN_EMAIL / ADMIN_PASSWORD.
 */
function seedCafeAdmin(sqlite: Database.Database) {
  const { email, password, name } = SEED_ADMIN;
  if (!email || !password) return;

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const existing = sqlite
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: string } | undefined;

  if (!existing) {
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, is_admin, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .run(id, name, email, hash, now);
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO preference_profiles (
           user_id, diet_type, hard_avoids_json, soft_dislikes_json, likes_json,
           goals_json, allergies_json, freeform_notes, user_facing_summary,
           email_enabled, email_time_local, timezone, onboarding_completed, updated_at
         ) VALUES (?, 'non_veg', '[]', '[]', '[]', '[]', '[]', '', 'Cafe admin account', 0, '07:00', 'Asia/Kolkata', 1, ?)`
      )
      .run(id, now);
    console.log(`[seed] Cafe admin created: ${email}`);
  } else {
    sqlite
      .prepare(
        `UPDATE users SET name = ?, password_hash = ?, is_admin = 1 WHERE email = ?`
      )
      .run(name, hash, email);
    console.log(`[seed] Cafe admin ready: ${email}`);
  }
}

function createDb() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "menu-match.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite);
  if (!globalForDb.__menuMatchSeeded) {
    seedCafeAdmin(sqlite);
    globalForDb.__menuMatchSeeded = true;
    // Start digest tick after DB is ready (lazy, server-only)
    try {
      // dynamic to avoid circular import at module load
      void import("../digest-scheduler").then((m) => m.startDigestScheduler());
    } catch {
      /* ignore */
    }
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function getDb() {
  if (!globalForDb.__menuMatchDb) {
    const { sqlite, db } = createDb();
    globalForDb.__menuMatchSqlite = sqlite;
    globalForDb.__menuMatchDb = db;
  }
  return globalForDb.__menuMatchDb!;
}

export { schema };
