import { env } from "./env.js";
import { q } from "./db.js";

export const PLATFORM_PANEL_PERMISSIONS = [
  "moderate_users",
  "manage_badges",
  "manage_boosts",
  "send_official_messages",
  "manage_blogs",
] as const;

export type PlatformPanelPermission =
  (typeof PLATFORM_PANEL_PERMISSIONS)[number];

export type PlatformRole = "user" | "staff" | "admin" | "owner";

type LegacyPlatformRole = "user" | "admin" | "owner";

export type PlatformStaffAssignment = {
  userId: string;
  username: string;
  email: string | null;
  levelKey: string;
  title: string;
  permissions: PlatformPanelPermission[];
  notes: string | null;
  assignedBy: string | null;
  assignedByUsername: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAccess = {
  platformRole: PlatformRole;
  legacyRole: LegacyPlatformRole;
  isPlatformAdmin: boolean;
  isPlatformOwner: boolean;
  canAccessPanel: boolean;
  permissions: PlatformPanelPermission[];
  staffAssignment: PlatformStaffAssignment | null;
};

type PlatformStaffAssignmentRow = {
  user_id: string;
  username: string;
  email: string | null;
  level_key: string;
  title: string;
  permissions_json: string | null;
  notes: string | null;
  assigned_by: string | null;
  assigned_by_username: string | null;
  created_at: string;
  updated_at: string;
};

function normalizePermission(value: string): PlatformPanelPermission | null {
  const trimmed = String(value || "").trim();
  return PLATFORM_PANEL_PERMISSIONS.includes(
    trimmed as PlatformPanelPermission,
  )
    ? (trimmed as PlatformPanelPermission)
    : null;
}

export function normalizePlatformPermissions(
  values: unknown,
): PlatformPanelPermission[] {
  let rawValues: unknown = [];
  if (Array.isArray(values)) rawValues = values;
  else if (typeof values === "string") {
    try {
      rawValues = JSON.parse(values);
    } catch {
      rawValues = [];
    }
  }

  if (!Array.isArray(rawValues)) return [];

  return Array.from(
    new Set(
      rawValues
        .map((value) => normalizePermission(String(value || "")))
        .filter((value): value is PlatformPanelPermission => !!value),
    ),
  );
}

export function serializePlatformPermissions(
  permissions: PlatformPanelPermission[],
) {
  return JSON.stringify(normalizePlatformPermissions(permissions));
}

export async function getLegacyPlatformRole(
  userId: string,
): Promise<LegacyPlatformRole> {
  const founder = await q<{ founder_user_id: string | null }>(
    `SELECT founder_user_id FROM platform_config WHERE id=1`,
  );
  if (founder.length && founder[0].founder_user_id === userId) return "owner";

  const admin = await q<{ user_id: string }>(
    `SELECT user_id FROM platform_admins WHERE user_id=:userId`,
    { userId },
  );
  if (admin.length) return "admin";

  return "user";
}

function mapStaffAssignment(
  row: PlatformStaffAssignmentRow | undefined,
): PlatformStaffAssignment | null {
  if (!row?.user_id) return null;
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email || null,
    levelKey: row.level_key,
    title: row.title,
    permissions: normalizePlatformPermissions(row.permissions_json || "[]"),
    notes: row.notes || null,
    assignedBy: row.assigned_by || null,
    assignedByUsername: row.assigned_by_username || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPlatformStaffAssignment(
  userId: string,
): Promise<PlatformStaffAssignment | null> {
  const rows = await q<PlatformStaffAssignmentRow>(
    `SELECT psa.user_id, u.username, u.email, psa.level_key, psa.title,
            psa.permissions_json, psa.notes, psa.assigned_by,
            assigner.username AS assigned_by_username,
            psa.created_at, psa.updated_at
       FROM platform_staff_assignments psa
       JOIN users u ON u.id=psa.user_id
       LEFT JOIN users assigner ON assigner.id=psa.assigned_by
      WHERE psa.user_id=:userId
      LIMIT 1`,
    { userId },
  );
  return mapStaffAssignment(rows[0]);
}

export async function listPlatformStaffAssignments() {
  const rows = await q<PlatformStaffAssignmentRow>(
    `SELECT psa.user_id, u.username, u.email, psa.level_key, psa.title,
            psa.permissions_json, psa.notes, psa.assigned_by,
            assigner.username AS assigned_by_username,
            psa.created_at, psa.updated_at
       FROM platform_staff_assignments psa
       JOIN users u ON u.id=psa.user_id
       LEFT JOIN users assigner ON assigner.id=psa.assigned_by
      ORDER BY psa.updated_at DESC, psa.created_at DESC`,
  );
  return rows.map((row) => mapStaffAssignment(row)).filter(Boolean) as
    PlatformStaffAssignment[];
}

export async function getPlatformAccess(
  userId: string,
): Promise<PlatformAccess> {
  const legacyRole = await getLegacyPlatformRole(userId);
  const staffAssignment = await getPlatformStaffAssignment(userId);

  if (legacyRole === "owner" || legacyRole === "admin") {
    return {
      platformRole: legacyRole,
      legacyRole,
      isPlatformAdmin: true,
      isPlatformOwner: legacyRole === "owner",
      canAccessPanel: true,
      permissions: [...PLATFORM_PANEL_PERMISSIONS],
      staffAssignment,
    };
  }

  const permissions = staffAssignment?.permissions || [];
  return {
    platformRole: permissions.length > 0 ? "staff" : "user",
    legacyRole,
    isPlatformAdmin: false,
    isPlatformOwner: false,
    canAccessPanel: permissions.length > 0,
    permissions,
    staffAssignment,
  };
}

export function requestHasPanelPassword(req: {
  headers?: Record<string, unknown>;
}) {
  const raw = req?.headers?.["x-admin-panel-password"];
  return typeof raw === "string" && raw.trim() === env.ADMIN_PANEL_PASSWORD;
}

export async function requirePanelAccess(req: {
  user?: { sub?: string };
  headers?: Record<string, unknown>;
}) {
  const userId = String(req.user?.sub || "").trim();
  if (!userId) throw new Error("FORBIDDEN");
  const access = await getPlatformAccess(userId);
  if (access.canAccessPanel || requestHasPanelPassword(req)) return access;
  throw new Error("FORBIDDEN");
}

export async function requirePanelPermission(
  req: {
    user?: { sub?: string };
    headers?: Record<string, unknown>;
  },
  permission: PlatformPanelPermission,
) {
  const access = await requirePanelAccess(req);
  if (
    access.isPlatformOwner ||
    access.isPlatformAdmin ||
    access.permissions.includes(permission) ||
    requestHasPanelPassword(req)
  ) {
    return access;
  }
  throw new Error("FORBIDDEN");
}
