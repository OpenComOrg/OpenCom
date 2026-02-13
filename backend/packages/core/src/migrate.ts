import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "-" && next === "-") {
        current += ch + next;
        i++;
        inLineComment = true;
        continue;
      }
      if (ch === "/" && next === "*") {
        current += ch + next;
        i++;
        inBlockComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;

    if (ch === ";" && !inSingle && !inDouble && !inBacktick) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const finalStmt = current.trim();
  if (finalStmt) statements.push(finalStmt);
  return statements;
}

async function main() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY, ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci`);

  const sqlDir = path.join(__dirname, "sql");
  const files = fs.readdirSync(sqlDir).filter(f => f.endsWith(".sql")).sort();

  for (const f of files) {
    const id = f.replace(".sql", "");
    const already = await q<{ id: string }>(`SELECT id FROM schema_migrations WHERE id=:id`, { id });
    if (already.length) continue;

    const sql = fs.readFileSync(path.join(sqlDir, f), "utf8");
    const statements = splitSqlStatements(sql);
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      for (const stmt of statements) {
        await conn.query(stmt);
      }
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
