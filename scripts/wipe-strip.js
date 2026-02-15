#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Resolve project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Load backend env
dotenv.config({ path: path.join(rootDir, "backend/.env") });

// Support either CORE_DATABASE_URL or DATABASE_URL
const dbUrl =
  process.env.CORE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("❌ No CORE_DATABASE_URL or DATABASE_URL found.");
  process.exit(1);
}

(async () => {
  try {
    const connection = await mysql.createConnection(dbUrl);

    console.log("Connected. Wiping Stripe subscription data...");

    await connection.execute(`
      UPDATE user_subscriptions
      SET
        stripe_customer_id = NULL,
        stripe_subscription_id = NULL,
        current_period_end = NULL,
        status = 'canceled'
    `);

    console.log("✅ Stripe data wiped successfully.");
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
