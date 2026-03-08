#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import mysql from "../backend/node_modules/mysql2/promise.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OFFICIAL_USERNAME = "opencom";

function loadEnvFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function nextId() {
  return `${Date.now().toString(36)}${crypto.randomBytes(10).toString("hex")}`;
}

function usage() {
  console.log(`Usage:
  node scripts/send-opencom-message.mjs --message "Text here" --all
  node scripts/send-opencom-message.mjs --message "Text here" --ids user1,user2
  node scripts/send-opencom-message.mjs --message "Text here" --usernames alice,bob

Options:
  --message     Required DM content to send from the opencom account
  --all         Send to every non-banned user except opencom
  --ids         Comma-separated user IDs
  --usernames   Comma-separated usernames (case-insensitive exact match)
  --env-file    Optional path to backend env file (defaults to backend/.env)
  --help        Show this message

Notes:
  This script inserts DM messages directly into the core database.
  Connected clients may need to refresh to see them immediately.
`);
}

function parseArgs(argv) {
  const options = {
    message: "",
    all: false,
    ids: [],
    usernames: [],
    envFile: "",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--message") {
      options.message = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--ids") {
      options.ids = parseCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--usernames") {
      options.usernames = parseCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function ensureThread(pool, userId, friendId) {
  const [userA, userB] = userId < friendId ? [userId, friendId] : [friendId, userId];
  const [existing] = await pool.query(
    `SELECT id FROM social_dm_threads WHERE user_a=:userA AND user_b=:userB LIMIT 1`,
    { userA, userB }
  );
  if (existing.length) return existing[0].id;

  const id = nextId();
  await pool.query(
    `INSERT INTO social_dm_threads (id,user_a,user_b) VALUES (:id,:userA,:userB)`,
    { id, userA, userB }
  );
  return id;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  if (!options.message.trim()) throw new Error("--message is required");
  if (!options.all && options.ids.length === 0 && options.usernames.length === 0) {
    throw new Error("Choose --all or provide --ids/--usernames");
  }
  if (options.all && (options.ids.length > 0 || options.usernames.length > 0)) {
    throw new Error("--all cannot be combined with --ids or --usernames");
  }

  const envFilePath = options.envFile
    ? resolve(process.cwd(), options.envFile)
    : resolve(__dirname, "../backend/.env");
  loadEnvFile(envFilePath);

  if (!process.env.CORE_DATABASE_URL) {
    throw new Error("CORE_DATABASE_URL is missing from the environment");
  }

  const pool = mysql.createPool({
    uri: process.env.CORE_DATABASE_URL,
    connectionLimit: 5,
    namedPlaceholders: true,
  });

  try {
    const [officialRows] = await pool.query(
      `SELECT id,username,display_name
       FROM users
       WHERE LOWER(username)=LOWER(:username)
       LIMIT 1`,
      { username: OFFICIAL_USERNAME }
    );
    const official = officialRows[0];
    if (!official?.id) {
      throw new Error("Official user 'opencom' was not found");
    }

    let recipients = [];

    if (options.all) {
      const [rows] = await pool.query(
        `SELECT u.id,u.username,u.display_name
         FROM users u
         LEFT JOIN account_bans ab ON ab.user_id=u.id
         WHERE ab.user_id IS NULL
           AND u.id<>:senderId
         ORDER BY u.created_at DESC`,
        { senderId: official.id }
      );
      recipients = rows;
    } else {
      const byId = [];
      const ids = unique(options.ids).filter((value) => value !== official.id);
      if (ids.length > 0) {
        const params = {};
        const inList = ids.map((value, index) => {
          params[`i${index}`] = value;
          return `:i${index}`;
        }).join(",");
        const [rows] = await pool.query(
          `SELECT u.id,u.username,u.display_name
           FROM users u
           LEFT JOIN account_bans ab ON ab.user_id=u.id
           WHERE ab.user_id IS NULL
             AND u.id IN (${inList})`,
          params
        );
        byId.push(...rows);
      }

      const usernames = unique(options.usernames).filter(
        (value) => value.toLowerCase() !== OFFICIAL_USERNAME
      );
      if (usernames.length > 0) {
        const params = {};
        const inList = usernames.map((value, index) => {
          params[`u${index}`] = value.toLowerCase();
          return `:u${index}`;
        }).join(",");
        const [rows] = await pool.query(
          `SELECT u.id,u.username,u.display_name
           FROM users u
           LEFT JOIN account_bans ab ON ab.user_id=u.id
           WHERE ab.user_id IS NULL
             AND LOWER(u.username) IN (${inList})`,
          params
        );
        byId.push(...rows);
      }

      const deduped = new Map();
      for (const row of byId) {
        deduped.set(row.id, row);
      }
      recipients = Array.from(deduped.values());
    }

    if (recipients.length === 0) {
      throw new Error("No eligible recipients found");
    }

    let sentCount = 0;
    const summary = [];

    for (const recipient of recipients) {
      const threadId = await ensureThread(pool, official.id, recipient.id);
      const messageId = nextId();
      await pool.query(
        `INSERT INTO social_dm_messages (id,thread_id,sender_user_id,content)
         VALUES (:id,:threadId,:senderId,:content)`,
        {
          id: messageId,
          threadId,
          senderId: official.id,
          content: options.message.trim(),
        }
      );
      await pool.query(
        `UPDATE social_dm_threads SET last_message_at=NOW() WHERE id=:threadId`,
        { threadId }
      );
      sentCount += 1;
      if (summary.length < 25) {
        summary.push({
          id: recipient.id,
          username: recipient.username,
          displayName: recipient.display_name,
          threadId,
        });
      }
    }

    console.log(JSON.stringify({
      ok: true,
      sender: official.username,
      audience: options.all ? "all" : "selected",
      sentCount,
      recipients: summary,
      note: "Messages were inserted directly into the database. Connected clients may need to refresh.",
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
