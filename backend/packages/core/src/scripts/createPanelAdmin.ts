import "./loadCoreEnv.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ulidLike } from "@ods/shared/ids.js";
import { hashPassword } from "../crypto.js";
import { pool, q } from "../db.js";
import {
  PLATFORM_PANEL_PERMISSIONS,
  type PlatformPanelPermission,
  normalizePlatformPermissions,
  serializePlatformPermissions,
} from "../panelAccess.js";

type PanelRole = "owner" | "admin" | "staff";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "").trim();
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = String(argv[i + 1] || "");
    if (!next || next.startsWith("--")) {
      out[key] = "1";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseRole(value: string): PanelRole | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "staff") {
    return normalized;
  }
  return null;
}

function normalizePermissions(rawValue: string, role: PanelRole): PlatformPanelPermission[] {
  if (role === "owner" || role === "admin") {
    return [...PLATFORM_PANEL_PERMISSIONS] as PlatformPanelPermission[];
  }

  const rawPermissions = String(rawValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized = normalizePlatformPermissions(rawPermissions);
  if (normalized.length) return normalized;
  return ["moderate_users"] as PlatformPanelPermission[];
}

function defaultTitleForRole(role: PanelRole) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Staff";
}

async function ask(rl: ReturnType<typeof createInterface>, question: string) {
  return (await rl.question(question)).trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = createInterface({ input, output });

  try {
    let email = String(args.email || "").trim();
    while (!looksLikeEmail(email)) {
      email = await ask(rl, "Admin email: ");
      if (!looksLikeEmail(email)) {
        output.write("Please enter a valid email address.\n");
      }
    }

    let username = String(args.username || "").trim();
    while (!username || username.length < 2 || username.length > 64) {
      username = await ask(rl, "Admin username (2-64 chars): ");
      if (!username || username.length < 2 || username.length > 64) {
        output.write("Username must be between 2 and 64 characters.\n");
      }
    }

    let password = String(args.password || "").trim();
    while (!password || password.length < 8) {
      password = await ask(rl, "Admin password (min 8 chars): ");
      if (!password || password.length < 8) {
        output.write("Password must be at least 8 characters.\n");
      }
    }

    let role = parseRole(String(args.role || "").trim()) || null;
    while (!role) {
      const value = await ask(rl, "Role (owner/admin/staff, default owner): ");
      role = parseRole(value || "owner");
      if (!role) output.write("Role must be owner, admin, or staff.\n");
    }

    const title = String(args.title || "").trim() || defaultTitleForRole(role);
    const notes = String(args.notes || "").trim() || null;
    const permissions = normalizePermissions(String(args.permissions || ""), role);

    const existing = await q<{ id: string }>(
      `SELECT id FROM panel_admin_users WHERE LOWER(email)=LOWER(:email) LIMIT 1`,
      { email },
    );
    if (existing.length) {
      throw new Error("ADMIN_EMAIL_EXISTS");
    }

    const id = String(args.id || "").trim() || ulidLike();
    const passwordHash = await hashPassword(password);

    await q(
      `INSERT INTO panel_admin_users (
         id,email,username,password_hash,role,title,permissions_json,notes,
         assigned_by,two_factor_enabled,force_two_factor_setup,totp_secret_encrypted
       ) VALUES (
         :id,:email,:username,:passwordHash,:role,:title,:permissionsJson,:notes,
         NULL,0,1,NULL
       )`,
      {
        id,
        email,
        username,
        passwordHash,
        role,
        title,
        permissionsJson: serializePlatformPermissions(permissions),
        notes,
      },
    );

    output.write("\nPanel admin user created successfully.\n");
    output.write(`ID: ${id}\n`);
    output.write(`Email: ${email}\n`);
    output.write(`Username: ${username}\n`);
    output.write(`Role: ${role}\n`);
    output.write(`Permissions: ${permissions.join(", ")}\n`);
    output.write("2FA setup is required on first login.\n");
  } catch (error) {
    const message = String((error as Error)?.message || "");
    if (message === "ADMIN_EMAIL_EXISTS") {
      console.error("[error] A panel admin with this email already exists.");
    } else {
      console.error(`[error] ${message || "Failed to create panel admin user."}`);
    }
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

await main();
