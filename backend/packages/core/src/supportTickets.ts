import crypto from "node:crypto";
import { ulidLike } from "@ods/shared/ids.js";
import { sha256Hex } from "./crypto.js";
import { q } from "./db.js";
import {
  sendSupportTicketCreatedEmail,
  sendSupportTicketReplyEmail,
  sendSupportTicketStatusEmail,
} from "./mail.js";

export const SUPPORT_TICKET_CATEGORIES = [
  "unban_appeal",
  "account_help",
  "billing",
  "bug_report",
  "feature_request",
  "safety",
  "other",
] as const;

export const SUPPORT_TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const SUPPORT_TICKET_STATUSES = [
  "open",
  "waiting_on_staff",
  "waiting_on_user",
  "resolved",
  "closed",
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export type SupportTicket = {
  id: string;
  reference: string;
  requesterName: string | null;
  contactEmail: string;
  opencomUserId: string | null;
  opencomUsername: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedTo: { userId: string; username: string | null } | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastPublicReplyAt: string | null;
  lastAdminReplyAt: string | null;
  closedAt: string | null;
};

export type SupportTicketMessage = {
  id: string;
  ticketId: string;
  authorType: "requester" | "staff" | "system";
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
};

export type SupportTicketDetail = {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
};

export type SupportEmailDelivery = {
  state: "sent" | "failed" | "skipped" | "unavailable";
  error: string | null;
};

type SupportTicketRow = {
  id: string;
  reference_code: string;
  access_key_hash?: string;
  requester_name: string | null;
  contact_email: string;
  opencom_user_id: string | null;
  opencom_username: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assigned_to_user_id: string | null;
  assigned_to_username?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  last_public_reply_at: string | null;
  last_admin_reply_at: string | null;
  closed_at: string | null;
};

type SupportMessageRow = {
  id: string;
  ticket_id: string;
  author_type: "requester" | "staff" | "system";
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  is_internal_note: number;
  created_at: string;
};

type CountRow = { count: number };
type GroupCountRow = { bucket: string | null; count: number };

function serializeTicket(row: SupportTicketRow): SupportTicket {
  return {
    id: row.id,
    reference: row.reference_code,
    requesterName: row.requester_name || null,
    contactEmail: row.contact_email,
    opencomUserId: row.opencom_user_id || null,
    opencomUsername: row.opencom_username || null,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to_user_id
      ? {
          userId: row.assigned_to_user_id,
          username: row.assigned_to_username || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    lastPublicReplyAt: row.last_public_reply_at,
    lastAdminReplyAt: row.last_admin_reply_at,
    closedAt: row.closed_at,
  };
}

function serializeMessage(row: SupportMessageRow): SupportTicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorType: row.author_type,
    authorUserId: row.author_user_id || null,
    authorName: row.author_name || null,
    body: row.body,
    isInternalNote: Boolean(row.is_internal_note),
    createdAt: row.created_at,
  };
}

function normalizeReference(reference: string) {
  return String(reference || "").trim().toUpperCase();
}

function buildSupportReference(ticketId: string) {
  return `SUP-${ticketId.replace(/_/g, "").toUpperCase()}`;
}

function issueSupportAccessKey() {
  return crypto.randomBytes(18).toString("hex");
}

function isClosedStatus(status: SupportTicketStatus) {
  return status === "resolved" || status === "closed";
}

export function formatSupportCategoryLabel(category: SupportTicketCategory) {
  switch (category) {
    case "unban_appeal":
      return "Unban appeal";
    case "account_help":
      return "Account help";
    case "billing":
      return "Billing";
    case "bug_report":
      return "Bug report";
    case "feature_request":
      return "Feature request";
    case "safety":
      return "Safety";
    case "other":
      return "Other";
    default:
      return category;
  }
}

export function formatSupportPriorityLabel(priority: SupportTicketPriority) {
  switch (priority) {
    case "low":
      return "Low";
    case "normal":
      return "Normal";
    case "high":
      return "High";
    case "urgent":
      return "Urgent";
    default:
      return priority;
  }
}

export function formatSupportStatusLabel(status: SupportTicketStatus) {
  switch (status) {
    case "open":
      return "Open";
    case "waiting_on_staff":
      return "Waiting on staff";
    case "waiting_on_user":
      return "Waiting on you";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

function mapMailError(error: unknown) {
  const code = String((error as Error)?.message || "").trim();
  if (code === "SMTP_NOT_CONFIGURED") return "SMTP_NOT_CONFIGURED";
  if (code === "SMTP_AUTH_FAILED") return "SMTP_AUTH_FAILED";
  if (code === "SMTP_CONNECTION_FAILED") return "SMTP_CONNECTION_FAILED";
  if (code === "EMAIL_SEND_FAILED") return "EMAIL_SEND_FAILED";
  return "EMAIL_SEND_FAILED";
}

async function deliverSupportEmail(send: () => Promise<void>): Promise<SupportEmailDelivery> {
  try {
    await send();
    return { state: "sent", error: null };
  } catch (error) {
    const mapped = mapMailError(error);
    if (mapped === "SMTP_NOT_CONFIGURED") {
      return { state: "unavailable", error: mapped };
    }
    return { state: "failed", error: mapped };
  }
}

async function getTicketRowById(ticketId: string) {
  const rows = await q<SupportTicketRow>(
    `SELECT st.id, st.reference_code, st.requester_name, st.contact_email,
            st.opencom_user_id, st.opencom_username, st.subject, st.category,
            st.priority, st.status, st.assigned_to_user_id,
            assigned.username AS assigned_to_username,
            st.created_at, st.updated_at, st.last_activity_at,
            st.last_public_reply_at, st.last_admin_reply_at, st.closed_at
       FROM support_tickets st
       LEFT JOIN users assigned ON assigned.id=st.assigned_to_user_id
      WHERE st.id=:ticketId
      LIMIT 1`,
    { ticketId }
  );
  return rows[0] || null;
}

async function getSecureTicketRowByReference(reference: string) {
  const rows = await q<SupportTicketRow>(
    `SELECT st.id, st.reference_code, st.access_key_hash, st.requester_name,
            st.contact_email, st.opencom_user_id, st.opencom_username, st.subject,
            st.category, st.priority, st.status, st.assigned_to_user_id,
            assigned.username AS assigned_to_username,
            st.created_at, st.updated_at, st.last_activity_at,
            st.last_public_reply_at, st.last_admin_reply_at, st.closed_at
       FROM support_tickets st
       LEFT JOIN users assigned ON assigned.id=st.assigned_to_user_id
      WHERE st.reference_code=:reference
      LIMIT 1`,
    { reference: normalizeReference(reference) }
  );
  return rows[0] || null;
}

async function listTicketMessages(ticketId: string, includeInternalNotes: boolean) {
  const rows = await q<SupportMessageRow>(
    `SELECT id, ticket_id, author_type, author_user_id, author_name, body,
            is_internal_note, created_at
       FROM support_ticket_messages
      WHERE ticket_id=:ticketId
        AND (:includeInternal=1 OR is_internal_note=0)
      ORDER BY created_at ASC, id ASC`,
    { ticketId, includeInternal: includeInternalNotes ? 1 : 0 }
  );
  return rows.map(serializeMessage);
}

async function appendTicketMessage(input: {
  ticketId: string;
  authorType: "requester" | "staff" | "system";
  authorUserId?: string | null;
  authorName?: string | null;
  body: string;
  isInternalNote?: boolean;
}) {
  const id = ulidLike();
  await q(
    `INSERT INTO support_ticket_messages (id, ticket_id, author_type, author_user_id, author_name, body, is_internal_note)
     VALUES (:id, :ticketId, :authorType, :authorUserId, :authorName, :body, :isInternalNote)`,
    {
      id,
      ticketId: input.ticketId,
      authorType: input.authorType,
      authorUserId: input.authorUserId || null,
      authorName: input.authorName || null,
      body: input.body,
      isInternalNote: input.isInternalNote ? 1 : 0,
    }
  );
  return id;
}

async function updateTicketState(
  ticketId: string,
  input: {
    requesterName?: string | null;
    subject?: string;
    category?: SupportTicketCategory;
    priority?: SupportTicketPriority;
    status?: SupportTicketStatus;
    assignedToUserId?: string | null;
    lastPublicReplyAt?: boolean;
    lastAdminReplyAt?: boolean;
  }
) {
  const current = await getTicketRowById(ticketId);
  if (!current) return null;

  const nextStatus = input.status ?? current.status;
  const closedAt = isClosedStatus(nextStatus) ? current.closed_at || new Date().toISOString().slice(0, 19).replace("T", " ") : null;

  await q(
    `UPDATE support_tickets
        SET requester_name=:requesterName,
            subject=:subject,
            category=:category,
            priority=:priority,
            status=:status,
            assigned_to_user_id=:assignedToUserId,
            last_activity_at=NOW(),
            last_public_reply_at=CASE
              WHEN :touchPublic=1 THEN NOW()
              ELSE last_public_reply_at
            END,
            last_admin_reply_at=CASE
              WHEN :touchAdmin=1 THEN NOW()
              ELSE last_admin_reply_at
            END,
            closed_at=:closedAt
      WHERE id=:ticketId`,
    {
      ticketId,
      requesterName:
        input.requesterName !== undefined ? input.requesterName : current.requester_name,
      subject: input.subject ?? current.subject,
      category: input.category ?? current.category,
      priority: input.priority ?? current.priority,
      status: nextStatus,
      assignedToUserId:
        input.assignedToUserId !== undefined
          ? input.assignedToUserId
          : current.assigned_to_user_id,
      touchPublic: input.lastPublicReplyAt ? 1 : 0,
      touchAdmin: input.lastAdminReplyAt ? 1 : 0,
      closedAt,
    }
  );

  return getTicketRowById(ticketId);
}

export async function createSupportTicket(input: {
  requesterName?: string | null;
  contactEmail: string;
  opencomUserId?: string | null;
  opencomUsername?: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority;
  message: string;
}) {
  const id = ulidLike();
  const referenceCode = buildSupportReference(id);
  const accessKey = issueSupportAccessKey();
  const accessKeyHash = sha256Hex(accessKey);
  const requesterName = input.requesterName?.trim() || input.opencomUsername?.trim() || null;
  const priority = input.priority || "normal";

  await q(
    `INSERT INTO support_tickets (
       id, reference_code, access_key_hash, requester_name, contact_email,
       opencom_user_id, opencom_username, subject, category, priority, status,
       created_at, updated_at, last_activity_at, last_public_reply_at, closed_at
     ) VALUES (
       :id, :referenceCode, :accessKeyHash, :requesterName, :contactEmail,
       :opencomUserId, :opencomUsername, :subject, :category, :priority, 'open',
       NOW(), NOW(), NOW(), NOW(), NULL
     )`,
    {
      id,
      referenceCode,
      accessKeyHash,
      requesterName,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      opencomUserId: input.opencomUserId?.trim() || null,
      opencomUsername: input.opencomUsername?.trim() || null,
      subject: input.subject.trim(),
      category: input.category,
      priority,
    }
  );

  await appendTicketMessage({
    ticketId: id,
    authorType: "requester",
    authorName: requesterName,
    body: input.message.trim(),
  });

  const row = await getTicketRowById(id);
  if (!row) throw new Error("SUPPORT_TICKET_CREATE_FAILED");

  const emailDelivery = await deliverSupportEmail(() =>
    sendSupportTicketCreatedEmail(input.contactEmail.trim().toLowerCase(), {
      ticketReference: row.reference_code,
      subject: row.subject,
      categoryLabel: formatSupportCategoryLabel(row.category),
      priorityLabel: formatSupportPriorityLabel(row.priority),
      accessKey,
    })
  );

  return {
    ticket: serializeTicket(row),
    accessKey,
    emailDelivery,
  };
}

export async function lookupSupportTicket(reference: string, accessKey: string): Promise<SupportTicketDetail | null> {
  const row = await getSecureTicketRowByReference(reference);
  if (!row) return null;
  if (row.access_key_hash !== sha256Hex(accessKey.trim())) return null;

  return {
    ticket: serializeTicket(row),
    messages: await listTicketMessages(row.id, false),
  };
}

export async function addSupportRequesterReply(input: {
  reference: string;
  accessKey: string;
  requesterName?: string | null;
  message: string;
}) {
  const current = await getSecureTicketRowByReference(input.reference);
  if (!current) return null;
  if (current.access_key_hash !== sha256Hex(input.accessKey.trim())) return null;

  const requesterName = input.requesterName?.trim() || current.requester_name || current.opencom_username || null;

  await appendTicketMessage({
    ticketId: current.id,
    authorType: "requester",
    authorName: requesterName,
    body: input.message.trim(),
  });

  const updated = await updateTicketState(current.id, {
    requesterName,
    status: "waiting_on_staff",
    lastPublicReplyAt: true,
  });

  if (!updated) return null;
  return {
    ticket: serializeTicket(updated),
    messages: await listTicketMessages(updated.id, false),
  };
}

export async function getSupportAdminOverview() {
  const totalRows = await q<CountRow>(`SELECT COUNT(*) AS count FROM support_tickets`);
  const byStatusRows = await q<GroupCountRow>(
    `SELECT status AS bucket, COUNT(*) AS count
       FROM support_tickets
      GROUP BY status`
  );
  const byCategoryRows = await q<GroupCountRow>(
    `SELECT category AS bucket, COUNT(*) AS count
       FROM support_tickets
      GROUP BY category`
  );
  const unresolvedRows = await q<CountRow>(
    `SELECT COUNT(*) AS count
       FROM support_tickets
      WHERE status IN ('open', 'waiting_on_staff', 'waiting_on_user')`
  );
  const unassignedRows = await q<CountRow>(
    `SELECT COUNT(*) AS count
       FROM support_tickets
      WHERE assigned_to_user_id IS NULL
        AND status IN ('open', 'waiting_on_staff', 'waiting_on_user')`
  );

  return {
    totalTickets: Number(totalRows[0]?.count || 0),
    unresolvedTickets: Number(unresolvedRows[0]?.count || 0),
    unassignedTickets: Number(unassignedRows[0]?.count || 0),
    byStatus: Object.fromEntries(
      byStatusRows.map((row) => [String(row.bucket || ""), Number(row.count || 0)])
    ),
    byCategory: Object.fromEntries(
      byCategoryRows.map((row) => [String(row.bucket || ""), Number(row.count || 0)])
    ),
  };
}

export async function listSupportTicketsForAdmin(filters: {
  status?: SupportTicketStatus | null;
  category?: SupportTicketCategory | null;
  priority?: SupportTicketPriority | null;
  assignedToUserId?: string | null;
  query?: string | null;
  limit?: number;
}) {
  const where: string[] = [];
  const params: Record<string, string | number | null> = {
    limit: Math.max(1, Math.min(100, Number(filters.limit || 40))),
  };

  if (filters.status) {
    where.push("st.status=:status");
    params.status = filters.status;
  }
  if (filters.category) {
    where.push("st.category=:category");
    params.category = filters.category;
  }
  if (filters.priority) {
    where.push("st.priority=:priority");
    params.priority = filters.priority;
  }
  if (filters.assignedToUserId) {
    if (filters.assignedToUserId === "__unassigned__") where.push("st.assigned_to_user_id IS NULL");
    else {
      where.push("st.assigned_to_user_id=:assignedToUserId");
      params.assignedToUserId = filters.assignedToUserId;
    }
  }
  if (filters.query?.trim()) {
    where.push(
      `(st.reference_code LIKE :likeQuery
        OR st.contact_email LIKE :likeQuery
        OR st.subject LIKE :likeQuery
        OR COALESCE(st.requester_name, '') LIKE :likeQuery
        OR COALESCE(st.opencom_username, '') LIKE :likeQuery
        OR COALESCE(st.opencom_user_id, '') LIKE :likeQuery)`
    );
    params.likeQuery = `%${filters.query.trim()}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await q<SupportTicketRow>(
    `SELECT st.id, st.reference_code, st.requester_name, st.contact_email,
            st.opencom_user_id, st.opencom_username, st.subject, st.category,
            st.priority, st.status, st.assigned_to_user_id,
            assigned.username AS assigned_to_username,
            st.created_at, st.updated_at, st.last_activity_at,
            st.last_public_reply_at, st.last_admin_reply_at, st.closed_at
       FROM support_tickets st
       LEFT JOIN users assigned ON assigned.id=st.assigned_to_user_id
       ${whereSql}
      ORDER BY
        CASE
          WHEN st.status IN ('open', 'waiting_on_staff') THEN 0
          WHEN st.status='waiting_on_user' THEN 1
          ELSE 2
        END ASC,
        st.last_activity_at DESC,
        st.created_at DESC
      LIMIT :limit`,
    params
  );

  return rows.map(serializeTicket);
}

export async function getSupportTicketForAdmin(ticketId: string): Promise<SupportTicketDetail | null> {
  const row = await getTicketRowById(ticketId);
  if (!row) return null;
  return {
    ticket: serializeTicket(row),
    messages: await listTicketMessages(ticketId, true),
  };
}

export async function updateSupportTicketByAdmin(ticketId: string, input: {
  subject?: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  status?: SupportTicketStatus;
  assignedToUserId?: string | null;
}) {
  const current = await getTicketRowById(ticketId);
  if (!current) return null;

  if (input.assignedToUserId) {
    const assigneeRows = await q<{ id: string }>(
      `SELECT id FROM users WHERE id=:userId LIMIT 1`,
      { userId: input.assignedToUserId }
    );
    if (!assigneeRows.length) {
      throw new Error("ASSIGNEE_NOT_FOUND");
    }
  }

  const updated = await updateTicketState(ticketId, {
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    status: input.status,
    assignedToUserId: input.assignedToUserId,
  });

  if (!updated) return null;

  let emailDelivery: SupportEmailDelivery = { state: "skipped", error: null };
  if (input.status && input.status !== current.status) {
    await appendTicketMessage({
      ticketId,
      authorType: "system",
      authorName: "OpenCom Support",
      body: `Ticket status updated to ${formatSupportStatusLabel(updated.status)}.`,
    });
    emailDelivery = await deliverSupportEmail(() =>
      sendSupportTicketStatusEmail(updated.contact_email, {
        ticketReference: updated.reference_code,
        subject: updated.subject,
        nextStatusLabel: formatSupportStatusLabel(updated.status),
      })
    );
  }

  return {
    ticket: serializeTicket(updated),
    messages: await listTicketMessages(ticketId, true),
    emailDelivery,
  };
}

export async function addSupportAdminReply(input: {
  ticketId: string;
  actorUserId: string;
  actorUsername: string;
  message: string;
  isInternalNote?: boolean;
  nextStatus?: SupportTicketStatus;
}) {
  const current = await getTicketRowById(input.ticketId);
  if (!current) return null;

  const isInternalNote = input.isInternalNote === true;
  const resolvedStatus =
    input.nextStatus ||
    (isInternalNote ? current.status : "waiting_on_user");

  await appendTicketMessage({
    ticketId: input.ticketId,
    authorType: "staff",
    authorUserId: input.actorUserId,
    authorName: input.actorUsername,
    body: input.message.trim(),
    isInternalNote,
  });

  const updated = await updateTicketState(input.ticketId, {
    status: resolvedStatus,
    lastAdminReplyAt: true,
  });
  if (!updated) return null;

  let emailDelivery: SupportEmailDelivery = { state: "skipped", error: null };
  if (isInternalNote) {
    if (resolvedStatus !== current.status) {
      emailDelivery = await deliverSupportEmail(() =>
        sendSupportTicketStatusEmail(updated.contact_email, {
          ticketReference: updated.reference_code,
          subject: updated.subject,
          nextStatusLabel: formatSupportStatusLabel(updated.status),
        })
      );
    }
  } else {
    emailDelivery = await deliverSupportEmail(() =>
      sendSupportTicketReplyEmail(updated.contact_email, {
        ticketReference: updated.reference_code,
        subject: updated.subject,
        currentStatusLabel: formatSupportStatusLabel(updated.status),
        replyBody: input.message.trim(),
      })
    );
  }

  return {
    ticket: serializeTicket(updated),
    messages: await listTicketMessages(input.ticketId, true),
    emailDelivery,
  };
}
