import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type SendSmtpEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseBool(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function resolveSmtpConfig(sourceEnv: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = firstNonEmpty(sourceEnv.SMTP_HOST, sourceEnv.ZOHO_SMTP_HOST, "smtp.zoho.com");
  const user = firstNonEmpty(sourceEnv.SMTP_USER, sourceEnv.ZOHO_SMTP_USER, sourceEnv.ZOHO_EMAIL);
  const pass = firstNonEmpty(sourceEnv.SMTP_PASS, sourceEnv.ZOHO_SMTP_PASS, sourceEnv.ZOHO_APP_PASSWORD, sourceEnv.ZOHO_PASSWORD);
  const from = firstNonEmpty(sourceEnv.SMTP_FROM, sourceEnv.ZOHO_SMTP_FROM, user);

  const port = Number(sourceEnv.ZOHO_SMTP_PORT || sourceEnv.SMTP_PORT || 587);
  const explicitSecure = parseBool(sourceEnv.ZOHO_SMTP_SECURE);
  const fallbackSecure = parseBool(sourceEnv.SMTP_SECURE);
  const secure = explicitSecure == null ? (fallbackSecure == null ? port === 465 : fallbackSecure) : explicitSecure;

  if (!user || !pass || !from) throw new Error("SMTP_NOT_CONFIGURED");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_NOT_CONFIGURED");

  return { host, port, secure, user, pass, from };
}

function getTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });
}

export async function sendSmtpEmail(input: SendSmtpEmailInput) {
  const cfg = resolveSmtpConfig();
  const transporter = getTransporter(cfg);
  try {
    await transporter.sendMail({
      from: input.from || cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo
    });
  } catch (error) {
    const message = String((error as any)?.message || "").toLowerCase();
    const responseCode = Number((error as any)?.responseCode || 0);
    if (responseCode === 535 || responseCode === 534 || message.includes("auth")) {
      throw new Error("SMTP_AUTH_FAILED");
    }
    if (message.includes("connect") || message.includes("timeout") || message.includes("econnrefused")) {
      throw new Error("SMTP_CONNECTION_FAILED");
    }
    throw new Error("EMAIL_SEND_FAILED");
  }
}
