import { q } from "./db.js";

export const PLATFORM_PANEL_PERMISSIONS = [
  "moderate_users",
  "manage_badges",
  "manage_boosts",
  "send_official_messages",
  "manage_blogs",
  "manage_support",
] as const;

export type PlatformPanelPermission =
  (typeof PLATFORM_PANEL_PERMISSIONS)[number];

export type PanelRole = "staff" | "admin" | "owner";

export type PanelStaffAssignment = {
  userId: string;
  username: string;
  email: string;
  levelKey: string;
  title: string;
  permissions: PlatformPanelPermission[];
  notes: string | null;
  assignedBy: string | null;
  assignedByUsername: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PanelAccess = {
  platformRole: PanelRole;
  isPlatformAdmin: boolean;
  isPlatformOwner: boolean;
  canAccessPanel: boolean;
  permissions: PlatformPanelPermission[];
  staffAssignment: PanelStaffAssignment | null;
};

export type PanelAdminIdentity = {
  id: string;
  email: string;
  username: string;
  role: PanelRole;
};

type PanelAdminAccessRow = {
  id: string;
  email: string;
  username: string;
  role: PanelRole;
  title: string;
  permissions_json: string | null;
  notes: string | null;
  assigned_by: string | null;
  assigned_by_username: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
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

function mapStaffAssignment(
  row: PanelAdminAccessRow | undefined,
): PanelStaffAssignment | null {
  if (!row?.id) return null;
  if (row.role !== "staff") return null;

  return {
    userId: row.id,
    username: row.username,
    email: row.email,
    levelKey: "staff",
    title: row.title || "Staff",
    permissions: normalizePlatformPermissions(row.permissions_json || "[]"),
    notes: row.notes || null,
    assignedBy: row.assigned_by || null,
    assignedByUsername: row.assigned_by_username || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPanelAdminRow(adminId: string) {
  const rows = await q<PanelAdminAccessRow>(
    `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
            pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
            pa.created_at, pa.updated_at, pa.disabled_at
       FROM panel_admin_users pa
       LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
      WHERE pa.id=:adminId
      LIMIT 1`,
    { adminId },
  );
  return rows[0] ?? null;
}

export async function getPanelAdminIdentity(adminId: string): Promise<PanelAdminIdentity | null> {
  const row = await getPanelAdminRow(adminId);
  if (!row || row.disabled_at) return null;

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
  };
}

export async function getPanelStaffAssignment(
  adminId: string,
): Promise<PanelStaffAssignment | null> {
  return mapStaffAssignment(await getPanelAdminRow(adminId) || undefined);
}

export async function listPanelStaffAssignments() {
  const rows = await q<PanelAdminAccessRow>(
    `SELECT pa.id, pa.email, pa.username, pa.role, pa.title, pa.permissions_json,
            pa.notes, pa.assigned_by, assigner.username AS assigned_by_username,
            pa.created_at, pa.updated_at, pa.disabled_at
       FROM panel_admin_users pa
       LEFT JOIN panel_admin_users assigner ON assigner.id=pa.assigned_by
      WHERE pa.role='staff'
      ORDER BY pa.updated_at DESC, pa.created_at DESC`,
  );

  return rows
    .map((row) => mapStaffAssignment(row))
    .filter((row): row is PanelStaffAssignment => !!row);
}

export async function getPanelAccess(
  adminId: string,
): Promise<PanelAccess> {
  const row = await getPanelAdminRow(adminId);
  if (!row || row.disabled_at) throw new Error("FORBIDDEN");

  if (row.role === "owner" || row.role === "admin") {
    return {
      platformRole: row.role,
      isPlatformAdmin: true,
      isPlatformOwner: row.role === "owner",
      canAccessPanel: true,
      permissions: [...PLATFORM_PANEL_PERMISSIONS],
      staffAssignment: mapStaffAssignment(row),
    };
  }

  const permissions = normalizePlatformPermissions(row.permissions_json || "[]");
  return {
    platformRole: "staff",
    isPlatformAdmin: false,
    isPlatformOwner: false,
    canAccessPanel: permissions.length > 0,
    permissions,
    staffAssignment: mapStaffAssignment(row),
  };
}

export async function requirePanelAccess(req: {
  panelAdmin?: { id?: string };
  user?: { sub?: string };
}) {
  const adminId = String(req.panelAdmin?.id || req.user?.sub || "").trim();
  if (!adminId) throw new Error("FORBIDDEN");

  const access = await getPanelAccess(adminId);
  if (access.canAccessPanel) return access;
  throw new Error("FORBIDDEN");
}

export async function requirePanelPermission(
  req: {
    panelAdmin?: { id?: string };
    user?: { sub?: string };
  },
  permission: PlatformPanelPermission,
) {
  const access = await requirePanelAccess(req);
  if (
    access.isPlatformOwner ||
    access.isPlatformAdmin ||
    access.permissions.includes(permission)
  ) {
    return access;
  }
  throw new Error("FORBIDDEN");
}
