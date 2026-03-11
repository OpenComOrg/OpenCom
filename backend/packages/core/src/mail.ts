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
