import { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseBody } from "../validation.js";
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  addSupportAdminReply,
  addSupportRequesterReply,
  createOrAppendMessageReportTicket,
  createSupportTicket,
  getSupportAdminOverview,
  getSupportTicketForAdmin,
  listSupportTicketsForAdmin,
  lookupSupportTicket,
  updateSupportTicketByAdmin,
} from "../supportTickets.js";
import { getPlatformAccess, requestHasPanelPassword } from "../platformStaff.js";
import { q } from "../db.js";

const optionalTrimmedString = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  }, z.string().max(max).optional());

const supportCategoryEnum = z.enum(SUPPORT_TICKET_CATEGORIES);
const supportPriorityEnum = z.enum(SUPPORT_TICKET_PRIORITIES);
const supportStatusEnum = z.enum(SUPPORT_TICKET_STATUSES);

const createTicketBody = z.object({
  requesterName: optionalTrimmedString(120),
  contactEmail: z.string().trim().email().max(190),
  opencomUserId: optionalTrimmedString(64),
  opencomUsername: optionalTrimmedString(64),
  subject: z.string().trim().min(4).max(180),
  category: supportCategoryEnum,
  priority: supportPriorityEnum.optional(),
  message: z.string().trim().min(10).max(5000),
});

const lookupTicketBody = z.object({
  reference: z.string().trim().min(8).max(96),
  accessKey: z.string().trim().min(12).max(128),
});

const requesterReplyBody = z.object({
  accessKey: z.string().trim().min(12).max(128),
  requesterName: optionalTrimmedString(120),
  message: z.string().trim().min(2).max(5000),
});

const reportAttachmentBody = z.object({
  fileName: optionalTrimmedString(180),
  contentType: optionalTrimmedString(120),
  url: optionalTrimmedString(512),
});

const reportContextMessageBody = z.object({
  messageId: optionalTrimmedString(96),
  authorUserId: optionalTrimmedString(64),
  authorName: optionalTrimmedString(120),
  createdAt: optionalTrimmedString(96),
  content: optionalTrimmedString(4000),
  attachments: z.array(reportAttachmentBody).max(8).optional(),
});

const reportMessageBody = z.object({
  reportedUserId: z.string().trim().min(3).max(64),
  reportedUsername: optionalTrimmedString(64),
  reportNote: optionalTrimmedString(2000),
  source: z.object({
    kind: z.enum(["server", "dm"]),
    serverId: optionalTrimmedString(64),
    serverName: optionalTrimmedString(120),
    channelId: optionalTrimmedString(64),
    channelName: optionalTrimmedString(120),
    dmThreadId: optionalTrimmedString(64),
    dmTitle: optionalTrimmedString(120),
  }),
  reportedMessage: reportContextMessageBody,
  contextMessages: z.array(reportContextMessageBody).max(7).optional(),
});

const adminTicketListQuery = z.object({
  status: supportStatusEnum.optional(),
  category: supportCategoryEnum.optional(),
  priority: supportPriorityEnum.optional(),
  assignedToUserId: optionalTrimmedString(64),
  query: optionalTrimmedString(120),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const adminTicketUpdateBody = z.object({
  subject: z.string().trim().min(4).max(180).optional(),
  category: supportCategoryEnum.optional(),
  priority: supportPriorityEnum.optional(),
  status: supportStatusEnum.optional(),
  assignedToUserId: z.preprocess((value) => {
    if (value === null) return null;
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }, z.string().min(3).max(64).nullable().optional()),
});

const adminReplyBody = z.object({
  message: z.string().trim().min(2).max(5000),
  isInternalNote: z.boolean().optional(),
  nextStatus: supportStatusEnum.optional(),
});

async function requireSupportAccess(req: any) {
  const userId = String(req.user?.sub || "").trim();
  if (!userId) throw new Error("FORBIDDEN");
  const access = await getPlatformAccess(userId);
  if (
    access.isPlatformOwner ||
    access.isPlatformAdmin ||
    access.permissions.includes("manage_support") ||
    requestHasPanelPassword(req)
  ) {
    return access;
  }
  throw new Error("FORBIDDEN");
}

async function getActorUsername(userId: string) {
  const rows = await q<{ username: string }>(
    `SELECT username FROM users WHERE id=:userId LIMIT 1`,
    { userId }
  );
  return rows[0]?.username || "Support Agent";
}

export async function supportRoutes(app: FastifyInstance) {
  app.post("/v1/support/tickets", async (req, rep) => {
    const body = parseBody(createTicketBody, req.body);
    const created = await createSupportTicket(body);
    return rep.code(201).send(created);
  });

  app.post("/v1/support/tickets/lookup", async (req, rep) => {
    const body = parseBody(lookupTicketBody, req.body);
    const detail = await lookupSupportTicket(body.reference, body.accessKey);
    if (!detail) return rep.code(404).send({ error: "SUPPORT_TICKET_NOT_FOUND" });
    return detail;
  });

  app.post("/v1/support/tickets/:reference/replies", async (req, rep) => {
    const { reference } = z.object({ reference: z.string().trim().min(8).max(96) }).parse(req.params);
    const body = parseBody(requesterReplyBody, req.body);
    const detail = await addSupportRequesterReply({
      reference,
      accessKey: body.accessKey,
      requesterName: body.requesterName,
      message: body.message,
    });
    if (!detail) return rep.code(404).send({ error: "SUPPORT_TICKET_NOT_FOUND" });
    return detail;
  });

  app.post("/v1/support/message-reports", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const reporterUserId = String(req.user?.sub || "").trim();
    if (!reporterUserId) return rep.code(401).send({ error: "UNAUTHORIZED" });

    const body = parseBody(reportMessageBody, req.body);
    if (body.reportedUserId === reporterUserId) {
      return rep.code(400).send({ error: "CANNOT_REPORT_SELF" });
    }
    if (
      body.reportedMessage.authorUserId &&
      body.reportedMessage.authorUserId !== body.reportedUserId
    ) {
      return rep.code(400).send({ error: "REPORTED_MESSAGE_AUTHOR_MISMATCH" });
    }

    const reporterRows = await q<{
      id: string;
      email: string;
      username: string;
      display_name: string | null;
    }>(
      `SELECT id,email,username,display_name
         FROM users
        WHERE id=:userId
        LIMIT 1`,
      { userId: reporterUserId }
    );
    if (!reporterRows.length) return rep.code(401).send({ error: "ACCOUNT_NOT_FOUND" });

    const targetRows = await q<{ id: string; username: string }>(
      `SELECT id,username
         FROM users
        WHERE id=:userId
        LIMIT 1`,
      { userId: body.reportedUserId }
    );
    if (!targetRows.length) return rep.code(404).send({ error: "REPORTED_USER_NOT_FOUND" });

    const reporter = reporterRows[0];
    const target = targetRows[0];
    const result = await createOrAppendMessageReportTicket({
      reporterUserId: reporter.id,
      reporterEmail: reporter.email,
      reporterUsername: reporter.username,
      reporterDisplayName: reporter.display_name || reporter.username,
      reportedUserId: target.id,
      reportedUsername: target.username,
      reportNote: body.reportNote,
      source: body.source,
      reportedMessage: {
        ...body.reportedMessage,
        authorUserId: body.reportedMessage.authorUserId || target.id,
        authorName:
          body.reportedMessage.authorName ||
          body.reportedUsername ||
          target.username,
      },
      contextMessages: body.contextMessages,
    });

    return rep.code(result.mode === "created" ? 201 : 200).send(result);
  });

  app.get("/v1/admin/support/overview", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    try {
      await requireSupportAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    return getSupportAdminOverview();
  });

  app.get("/v1/admin/support/tickets", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    try {
      await requireSupportAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const query = adminTicketListQuery.parse(req.query);
    return {
      tickets: await listSupportTicketsForAdmin(query),
    };
  });

  app.get("/v1/admin/support/tickets/:ticketId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    try {
      await requireSupportAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { ticketId } = z.object({ ticketId: z.string().min(3) }).parse(req.params);
    const detail = await getSupportTicketForAdmin(ticketId);
    if (!detail) return rep.code(404).send({ error: "SUPPORT_TICKET_NOT_FOUND" });
    return detail;
  });

  app.put("/v1/admin/support/tickets/:ticketId", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    try {
      await requireSupportAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { ticketId } = z.object({ ticketId: z.string().min(3) }).parse(req.params);
    const body = parseBody(adminTicketUpdateBody, req.body);

    try {
      const updated = await updateSupportTicketByAdmin(ticketId, body);
      if (!updated) return rep.code(404).send({ error: "SUPPORT_TICKET_NOT_FOUND" });
      return updated;
    } catch (error) {
      if ((error as Error)?.message === "ASSIGNEE_NOT_FOUND") {
        return rep.code(404).send({ error: "ASSIGNEE_NOT_FOUND" });
      }
      throw error;
    }
  });

  app.post("/v1/admin/support/tickets/:ticketId/reply", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    try {
      await requireSupportAccess(req);
    } catch {
      return rep.code(403).send({ error: "FORBIDDEN" });
    }

    const { ticketId } = z.object({ ticketId: z.string().min(3) }).parse(req.params);
    const body = parseBody(adminReplyBody, req.body);
    const actorUserId = req.user.sub as string;
    const actorUsername = await getActorUsername(actorUserId);

    const updated = await addSupportAdminReply({
      ticketId,
      actorUserId,
      actorUsername,
      message: body.message,
      isInternalNote: body.isInternalNote,
      nextStatus: body.nextStatus,
    });

    if (!updated) return rep.code(404).send({ error: "SUPPORT_TICKET_NOT_FOUND" });
    return updated;
  });
}
