import { env } from "./env.js";
import { sendSmtpEmail } from "./smtp.js";

type SendSigninEmailInput = {
  ip: string;
  happenedAt?: Date | string;
  userAgent?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value?: Date | string): string {
  if (!value) return new Date().toUTCString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toUTCString();
}

export async function sendVerificationEmail(to: string, verifyToken: string) {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const verifyUrl = `${base}/?verifyEmailToken=${encodeURIComponent(verifyToken)}`;
  await sendSmtpEmail({
    to,
    subject: "Verify your OpenCom account",
    text: `Welcome to OpenCom.\n\nVerify your email by opening this link:\n${verifyUrl}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<p>Welcome to OpenCom.</p><p>Verify your email by opening this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you did not create this account, you can ignore this email.</p>`
  });
}

export async function sendPasswordResetEmail(to: string, resetToken: string) {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const resetUrl = `${base}/?resetPasswordToken=${encodeURIComponent(resetToken)}`;
  await sendSmtpEmail({
    to,
    subject: "Reset your OpenCom password",
    text: `We received a request to reset your OpenCom password.\n\nSet a new password by opening this link:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>We received a request to reset your OpenCom password.</p><p>Set a new password by opening this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`
  });
}

export async function sendSigninEmail(to: string, input: SendSigninEmailInput) {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const loginUrl = `${base}/login`;
  const happenedAt = formatTimestamp(input.happenedAt);
  const ip = input.ip.trim() || "unknown";
  const userAgent = input.userAgent?.trim() || "";
  const userAgentText = userAgent ? `\nUser agent: ${userAgent}` : "";
  const userAgentHtml = userAgent ? `<p><strong>User agent:</strong> <code>${escapeHtml(userAgent)}</code></p>` : "";

  await sendSmtpEmail({
    to,
    subject: "OpenCom suspicious sign-in alert",
    text: `We noticed a sign-in to your OpenCom account from a new IP address.\n\nTime: ${happenedAt}\nIP address: ${ip}${userAgentText}\n\nIf this was not you, sign in at ${loginUrl} and reset your password immediately.\nIf this was you, you can ignore this email.`,
    html: `<p>We noticed a sign-in to your OpenCom account from a new IP address.</p><p><strong>Time:</strong> ${escapeHtml(happenedAt)}<br /><strong>IP address:</strong> <code>${escapeHtml(ip)}</code></p>${userAgentHtml}<p>If this was not you, sign in at <a href="${loginUrl}">${loginUrl}</a> and reset your password immediately.</p><p>If this was you, you can ignore this email.</p>`
  });
}

function buildSupportTicketUrl(ticketReference: string, accessKey?: string) {
  const base = env.SUPPORT_BASE_URL.replace(/\/$/, "");
  const params = new URLSearchParams({ reference: ticketReference });
  if (accessKey) params.set("accessKey", accessKey);
  return `${base}/?${params.toString()}`;
}

export async function sendSupportTicketCreatedEmail(
  to: string,
  input: {
    ticketReference: string;
    subject: string;
    categoryLabel: string;
    priorityLabel: string;
    accessKey: string;
  }
) {
  const ticketUrl = buildSupportTicketUrl(input.ticketReference, input.accessKey);
  await sendSmtpEmail({
    to,
    subject: `OpenCom support ticket received: ${input.ticketReference}`,
    text:
      `We received your OpenCom support request.\n\n` +
      `Reference: ${input.ticketReference}\n` +
      `Subject: ${input.subject}\n` +
      `Category: ${input.categoryLabel}\n` +
      `Priority: ${input.priorityLabel}\n\n` +
      `Use this private access key to track or reply to your ticket:\n${input.accessKey}\n\n` +
      `Direct ticket link:\n${ticketUrl}\n\n` +
      `Keep this access key safe. Anyone with the ticket reference and key can view your support thread.`,
    html:
      `<p>We received your OpenCom support request.</p>` +
      `<p><strong>Reference:</strong> <code>${escapeHtml(input.ticketReference)}</code><br />` +
      `<strong>Subject:</strong> ${escapeHtml(input.subject)}<br />` +
      `<strong>Category:</strong> ${escapeHtml(input.categoryLabel)}<br />` +
      `<strong>Priority:</strong> ${escapeHtml(input.priorityLabel)}</p>` +
      `<p><strong>Private access key:</strong> <code>${escapeHtml(input.accessKey)}</code></p>` +
      `<p><a href="${ticketUrl}">Open your support ticket</a></p>` +
      `<p>Keep this access key safe. Anyone with the ticket reference and key can view your support thread.</p>`
  });
}

export async function sendSupportTicketReplyEmail(
  to: string,
  input: {
    ticketReference: string;
    subject: string;
    currentStatusLabel: string;
    replyBody: string;
  }
) {
  const ticketUrl = buildSupportTicketUrl(input.ticketReference);
  await sendSmtpEmail({
    to,
    subject: `New OpenCom support reply: ${input.ticketReference}`,
    text:
      `There is a new reply on your OpenCom support ticket.\n\n` +
      `Reference: ${input.ticketReference}\n` +
      `Subject: ${input.subject}\n` +
      `Current status: ${input.currentStatusLabel}\n\n` +
      `${input.replyBody}\n\n` +
      `Open your ticket:\n${ticketUrl}\n\n` +
      `Use the private access key from your original ticket confirmation email when reopening the thread.`,
    html:
      `<p>There is a new reply on your OpenCom support ticket.</p>` +
      `<p><strong>Reference:</strong> <code>${escapeHtml(input.ticketReference)}</code><br />` +
      `<strong>Subject:</strong> ${escapeHtml(input.subject)}<br />` +
      `<strong>Current status:</strong> ${escapeHtml(input.currentStatusLabel)}</p>` +
      `<blockquote>${escapeHtml(input.replyBody).replace(/\n/g, "<br />")}</blockquote>` +
      `<p>Open your ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>` +
      `<p>Use the private access key from your original ticket confirmation email when reopening the thread.</p>`
  });
}

export async function sendSupportTicketStatusEmail(
  to: string,
  input: {
    ticketReference: string;
    subject: string;
    nextStatusLabel: string;
  }
) {
  const ticketUrl = buildSupportTicketUrl(input.ticketReference);
  await sendSmtpEmail({
    to,
    subject: `OpenCom support status update: ${input.ticketReference}`,
    text:
      `Your OpenCom support ticket status has changed.\n\n` +
      `Reference: ${input.ticketReference}\n` +
      `Subject: ${input.subject}\n` +
      `New status: ${input.nextStatusLabel}\n\n` +
      `Open your ticket:\n${ticketUrl}\n\n` +
      `Use the private access key from your original ticket confirmation email when reopening the thread.`,
    html:
      `<p>Your OpenCom support ticket status has changed.</p>` +
      `<p><strong>Reference:</strong> <code>${escapeHtml(input.ticketReference)}</code><br />` +
      `<strong>Subject:</strong> ${escapeHtml(input.subject)}<br />` +
      `<strong>New status:</strong> ${escapeHtml(input.nextStatusLabel)}</p>` +
      `<p>Open your ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>` +
      `<p>Use the private access key from your original ticket confirmation email when reopening the thread.</p>`
  });
}
