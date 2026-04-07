import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, pool } from "./db.js";
import { env } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function assertExpectedDatabase(expectedDatabase: string) {
  const rows = await q<{ name: string | null }>(`SELECT DATABASE() AS name`);
  const currentDatabase = rows[0]?.name ?? null;

  if (currentDatabase !== expectedDatabase) {
    throw new Error(
      `Refusing to run InternalStatsAPI migrations against ${
        currentDatabase ?? "<none>"
      }; expected ${expectedDatabase}. Check DB_NAME/DB_HOST settings.`,
    );
  }
}

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
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += ch;
  }

  const finalStatement = current.trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

async function detectMigrationCollation() {
  const existingRows = await q<{ collation: string | null }>(
    `SELECT COLLATION_NAME AS collation
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND CHARACTER_SET_NAME = 'utf8mb4'
        AND TABLE_NAME IN ('internal_stats_reports', 'schema_migrations')
        AND COLLATION_NAME IS NOT NULL
      ORDER BY FIELD(TABLE_NAME, 'internal_stats_reports', 'schema_migrations')
      LIMIT 1`,
  );
  const existing = String(existingRows[0]?.collation || "").trim();
  if (existing) return existing;

  const supportedRows = await q<{ collation: string }>(
    `SELECT COLLATION_NAME AS collation
       FROM information_schema.COLLATIONS
      WHERE CHARACTER_SET_NAME = 'utf8mb4'`,
  );

  const supported = new Set(
    supportedRows
      .map((row) => String(row.collation || "").trim())
      .filter(Boolean),
  );

  const preferred = [
    "utf8mb4_uca1400_ai_ci",
    "utf8mb4_0900_ai_ci",
    "utf8mb4_unicode_ci",
    "utf8mb4_general_ci",
  ];

  for (const candidate of preferred) {
    if (supported.has(candidate)) return candidate;
  }

  return "utf8mb4_unicode_ci";
}

function normalizeMigrationSql(sql: string, utf8mb4Collation: string) {
  return sql.replaceAll("utf8mb4_uca1400_ai_ci", utf8mb4Collation);
}

async function main() {
  await assertExpectedDatabase(env.DB_NAME);

  const migrationCollation = await detectMigrationCollation();
  const schemaMigrationsSql = normalizeMigrationSql(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY, ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci`,
    migrationCollation,
  );
  await q(schemaMigrationsSql);

  const sqlDir = path.join(__dirname, "sql");
  if (!fs.existsSync(sqlDir)) {
    throw new Error(`Migration directory not found: ${sqlDir}`);
  }

  const files = fs
    .readdirSync(sqlDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  console.log(`Using migration collation ${migrationCollation}`);

  for (const file of files) {
    const id = `oauth_api:${file.replace(".sql", "")}`;
    const already = await q<{ id: string }>(
      `SELECT id FROM schema_migrations WHERE id=:id`,
      { id },
    );
    if (already.length) continue;

    const sql = normalizeMigrationSql(
      fs.readFileSync(path.join(sqlDir, file), "utf8"),
      migrationCollation,
    );
    const statements = splitSqlStatements(sql);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.query(`INSERT INTO schema_migrations (id) VALUES (?)`, [id]);
      await connection.commit();
      console.log(`Applied migration ${id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
