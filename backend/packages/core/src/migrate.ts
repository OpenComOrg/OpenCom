import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(64) PRIMARY KEY, ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  const sqlDir = path.join(__dirname, "sql");
  const files = fs.readdirSync(sqlDir).filter(f => f.endsWith(".sql")).sort();

  for (const f of files) {
    const id = f.replace(".sql", "");
    const already = await q<{ id: string }>(`SELECT id FROM schema_migrations WHERE id=:id`, { id });
    if (already.length) continue;

    const sql = fs.readFileSync(path.join(sqlDir, f), "utf8");
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.query(`INSERT INTO schema_migrations (id) VALUES (?)`, [id]);
      await conn.commit();
      console.log(`Applied migration ${id}`);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
