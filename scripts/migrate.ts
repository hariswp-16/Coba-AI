/**
 * Creates the SQLite schema if it does not exist.
 * Safe to run repeatedly (all statements are CREATE ... IF NOT EXISTS).
 */
import { getDb, DEFAULT_USER_ID } from "../src/lib/db/index";

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all() as { name: string }[];

console.log("Database siap.");
console.log(`  user default : ${DEFAULT_USER_ID}`);
console.log(`  tabel        : ${tables.map((t) => t.name).join(", ")}`);
