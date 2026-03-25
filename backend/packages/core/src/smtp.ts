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

export type SendSmtpEmailResult = {
  accepted: string[];
  rejected: string[];
  pending?: string[];
  response: string;
  messageId: string;
  envelope: {
    from: string | null;
    to: string[];
  };
};

export type PreviewSmtpEmailResult = {
  raw: string;
  envelope: {
    from: string | null;
    to: string[];
  };
  messageId: string;
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

function isTrue(value: string | undefined): boolean {
  return parseBool(value) === true;
}

function logSmtp(event: string, details?: Record<string, unknown>) {
  const payload = details ? { event, ...details } : { event };
  console.info("[smtp]", payload);
}

function logSmtpError(event: string, details?: Record<string, unknown>) {
  const payload = details ? { event, ...details } : { event };
  console.error("[smtp]", payload);
}

function normalizeEnvelope(value: any): { from: string | null; to: string[] } {
  const to = Array.isArray(value?.to)
    ? value.to.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
    : [];
  const from = typeof value?.from === "string" && value.from.trim() ? value.from.trim() : null;
  return { from, to };
}

function requireHeaderValue(name: string, value: string | undefined | null): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`SMTP_INVALID_${name.toUpperCase()}`);
  if (/[\r\n]/.test(normalized)) throw new Error(`SMTP_INVALID_${name.toUpperCase()}`);
  return normalized;
}

function buildMailOptions(cfg: SmtpConfig, input: SendSmtpEmailInput) {
  const from = requireHeaderValue("from", input.from || cfg.from);
  const to = requireHeaderValue("to", input.to);
  const subject = requireHeaderValue("subject", input.subject);
  const text = requireHeaderValue("text", input.text);
  const replyTo = input.replyTo ? requireHeaderValue("reply_to", input.replyTo) : undefined;
  const html = typeof input.html === "string" && input.html.trim() ? input.html : undefined;

  return {
    from,
    to,
    subject,
    text,
    html,
    replyTo,
    date: new Date(),
    headers: {
      "X-Mailer": "OpenCom SMTP"
    }
  };
}

function buildSmtpLogContext(cfg: SmtpConfig, input: SendSmtpEmailInput) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    from: input.from || cfg.from,
    to: input.to,
    replyTo: input.replyTo || null,
    subject: input.subject,
    hasHtml: Boolean(input.html && input.html.trim())
  };
}

function extractErrorDetails(error: unknown) {
  return {
    code: String((error as any)?.code || ""),
    responseCode: Number((error as any)?.responseCode || 0) || null,
    response: String((error as any)?.response || ""),
    command: String((error as any)?.command || ""),
    message: String((error as any)?.message || error || "")
  };
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
    },
    disableFileAccess: true,
    disableUrlAccess: true
  });
}

function mapSmtpError(error: unknown): Error {
  const message = String((error as any)?.message || "").toLowerCase();
  const code = String((error as any)?.code || "").toLowerCase();
  const responseCode = Number((error as any)?.responseCode || 0);
  if (responseCode === 535 || responseCode === 534 || message.includes("auth")) {
    return new Error("SMTP_AUTH_FAILED");
  }
  if (
    message.includes("connect") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("eai_again") ||
    message.includes("enotfound") ||
    code === "edns" ||
    code === "enotfound"
  ) {
    return new Error("SMTP_CONNECTION_FAILED");
  }
  if (message.includes("certificate") || message.includes("tls") || message.includes("ssl")) {
    return new Error("SMTP_CONNECTION_FAILED");
  }
  if (message.includes("smtp_invalid_")) {
    return error instanceof Error ? error : new Error(String(error));
  }
  return new Error("EMAIL_SEND_FAILED");
}

export async function verifySmtpConnection(sourceEnv: NodeJS.ProcessEnv = process.env) {
  const cfg = resolveSmtpConfig(sourceEnv);
  const transporter = getTransporter(cfg);
  try {
    await transporter.verify();
    return cfg;
  } catch (error) {
    throw mapSmtpError(error);
  }
}

export async function previewSmtpEmail(
  input: SendSmtpEmailInput,
  sourceEnv: NodeJS.ProcessEnv = process.env
): Promise<PreviewSmtpEmailResult> {
  const cfg = resolveSmtpConfig(sourceEnv);
  const previewTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows"
  } as any);
  const info = await previewTransport.sendMail(buildMailOptions(cfg, input));
  const rawMessage = (info as any).message;
  const raw = Buffer.isBuffer(rawMessage) ? rawMessage.toString("utf8") : String(rawMessage || "");
  return {
    raw,
    envelope: normalizeEnvelope(info.envelope),
    messageId: String(info.messageId || "")
  };
}

export async function sendSmtpEmail(input: SendSmtpEmailInput): Promise<SendSmtpEmailResult> {
  const cfg = resolveSmtpConfig();
  const transporter = getTransporter(cfg);
  const logContext = buildSmtpLogContext(cfg, input);
  const debugLogging = isTrue(process.env.SMTP_DEBUG_LOGGING);
  const debugVerify = isTrue(process.env.SMTP_DEBUG_VERIFY_BEFORE_SEND);
  try {
    if (debugLogging) {
      logSmtp("send:start", logContext);
    }
    if (debugVerify) {
      if (debugLogging) {
        logSmtp("verify:start", logContext);
      }
      await transporter.verify();
      logSmtp("verify:success", logContext);
    }
    if (debugLogging) {
      const preview = await previewSmtpEmail(input);
      logSmtp("preview", {
        ...logContext,
        envelope: preview.envelope,
        messageId: preview.messageId,
        raw: preview.raw
      });
    }
    const info = await transporter.sendMail(buildMailOptions(cfg, input));
    const result = {
      accepted: Array.isArray(info.accepted) ? info.accepted.map((entry) => String(entry)) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map((entry) => String(entry)) : [],
      pending: Array.isArray((info as any).pending) ? (info as any).pending.map((entry: unknown) => String(entry)) : [],
      response: String(info.response || ""),
      messageId: String(info.messageId || ""),
      envelope: normalizeEnvelope(info.envelope)
    };
    if (debugLogging) {
      logSmtp("send:success", {
        ...logContext,
        accepted: result.accepted,
        rejected: result.rejected,
        pending: result.pending || [],
        envelope: result.envelope,
        messageId: result.messageId,
        response: result.response
      });
    }
    return result;
  } catch (error) {
    logSmtpError("send:failure", {
      ...logContext,
      ...extractErrorDetails(error)
    });
    throw mapSmtpError(error);
  }
}
