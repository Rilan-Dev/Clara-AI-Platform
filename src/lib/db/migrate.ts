import fs from "fs";
import path from "path";
import { pool } from "@/lib/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");
const SEED_MIGRATION_PATTERNS = [/^007_seed_/, /^021_demo_/, /^025_demo_/, /^026_demo_/, /^027_demo_/];
function isSeedMigration(filename: string): boolean { return SEED_MIGRATION_PATTERNS.some((pattern) => pattern.test(filename)); }
let migrated = false;

async function createMigrationsTable(): Promise<void> { await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`); }
async function appliedMigrations(): Promise<Set<string>> { const result = await pool.query<{filename:string}>("SELECT filename FROM schema_migrations ORDER BY filename"); return new Set(result.rows.map(r=>r.filename)); }

async function runMigrations(): Promise<void> {
  await createMigrationsTable(); const applied = await appliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f=>f.endsWith(".sql")).sort(); let appliedCount=0;
  for(const filename of files){
    if(applied.has(filename)) continue;
    const isSeed=isSeedMigration(filename); const sql=fs.readFileSync(path.join(MIGRATIONS_DIR,filename),"utf-8"); const client=await pool.connect();
    try{await client.query("BEGIN");await client.query(sql);await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)",[filename]);await client.query("COMMIT");console.log(`[migrate] applied ${filename}`);appliedCount++;}
    catch(err){await client.query("ROLLBACK");if(isSeed) console.warn(`[migrate] skipped seed migration ${filename} (will retry on next restart):`,(err as Error).message);else{console.error(`[migrate] FAILED on required schema migration ${filename}:`,err);throw err;}}
    finally{client.release();}
  }
  if(appliedCount===0) console.log("[migrate] All migrations already applied.");
}

/** Load DB-backed runtime settings into process.env without overwriting explicit env values when DB is empty. */
async function loadRuntimeSettings(): Promise<void> {
  try {
    const result = await pool.query<{key:string;value:string}>("SELECT key, value FROM platform_env_settings WHERE value IS NOT NULL AND value <> ''");
    for(const row of result.rows) process.env[row.key]=row.value;
  } catch(err) {
    console.warn("[migrate] runtime settings could not be loaded:",(err as Error).message);
  }
}

export async function runMigrationsOnStartup(): Promise<void> { await runMigrations(); await loadRuntimeSettings(); migrated=true; }
export async function ensureMigrated(): Promise<void> { if(migrated) return; await runMigrations(); await loadRuntimeSettings(); migrated=true; }
