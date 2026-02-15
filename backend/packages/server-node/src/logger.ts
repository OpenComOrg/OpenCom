import { env } from "./env.js";

type Level = "debug" | "info" | "warn" | "error";
type Ctx = Record<string, unknown>;

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_PATTERNS = [/token/i, /password/i, /secret/i, /authorization/i, /cookie/i, /key/i];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) {
      next[key] = "[REDACTED]";
      continue;
    }
    next[key] = redact(raw);
  }
  return next;
}

function toErrorContext(error: unknown): Ctx {
  if (!(error instanceof Error)) return { errorMessage: String(error || "UNKNOWN_ERROR") };
  const base: Ctx = {
    errorMessage: error.message,
    errorName: error.name
  };
  if (env.NODE_ENV !== "production" && error.stack) base.stack = error.stack;
  return base;
}

function levelEnabled(level: Level) {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[env.LOG_LEVEL];
}

function write(level: Level, scope: string, message: string, context?: Ctx) {
  if (!levelEnabled(level)) return;

  const ctx = context ? redact(context) : undefined;
  const prefix = level === "warn" ? "!!! WARN" : level === "error" ? "!!! ERROR" : level.toUpperCase();
  const stamp = new Date().toISOString();
  const renderedCtx = ctx ? ` ${JSON.stringify(ctx)}` : "";
  const line = `[${stamp}] [${prefix}] [${scope}] ${message}${renderedCtx}`;

  if (level === "warn" || level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(scope: string) {
  return {
    debug(message: string, context?: Ctx) {
      write("debug", scope, message, context);
    },
    info(message: string, context?: Ctx) {
      write("info", scope, message, context);
    },
    warn(message: string, context?: Ctx) {
      write("warn", scope, message, context);
    },
    error(message: string, error?: unknown, context?: Ctx) {
      write("error", scope, message, {
        ...(context || {}),
        ...(error !== undefined ? toErrorContext(error) : {})
      });
    }
  };
}

export function sanitizeErrorMessage(error: unknown) {
  if (!error) return "UNKNOWN_ERROR";
  if (error instanceof Error) return error.message || error.name || "UNKNOWN_ERROR";
  if (typeof error === "string") return error;
  return "UNKNOWN_ERROR";
}
