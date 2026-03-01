import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSmtpConfig, sendSmtpEmail } from "../smtp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../.env") });

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function promptRecipientEmail(rl: ReturnType<typeof createInterface>): Promise<string> {
  while (true) {
    const value = (await rl.question("Recipient email address: ")).trim();
    if (!value) {
      output.write("Recipient email is required.\n");
      continue;
    }
    if (!looksLikeEmail(value)) {
      output.write("Please enter a valid email address.\n");
      continue;
    }
    return value;
  }
}

async function promptMultiline(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  output.write(`${label}\n`);
  output.write("End input with a single '.' on its own line.\n");

  const lines: string[] = [];
  while (true) {
    const line = await rl.question("> ");
    if (line.trim() === ".") break;
    lines.push(line);
  }

  if (!lines.some((line) => line.trim().length)) {
    throw new Error("EMAIL_CONTENT_REQUIRED");
  }

  return lines.join("\n");
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    const cfg = resolveSmtpConfig();
    output.write(`Using SMTP ${cfg.host}:${cfg.port} (${cfg.secure ? "secure" : "starttls"}) from ${cfg.from}\n`);

    const to = await promptRecipientEmail(rl);
    const subjectInput = (await rl.question("Subject (default: OpenCom SMTP test): ")).trim();
    const subject = subjectInput || "OpenCom SMTP test";

    const text = await promptMultiline(rl, "Enter plain text content:");
    const includeHtml = (await rl.question("Add HTML content too? (y/N): ")).trim().toLowerCase();
    const html = includeHtml === "y" || includeHtml === "yes"
      ? await promptMultiline(rl, "Enter HTML content:")
      : undefined;

    await sendSmtpEmail({ to, subject, text, html });
    output.write(`Sent test email to ${to}.\n`);
  } catch (error) {
    const message = String((error as any)?.message || error);
    if (message === "SMTP_NOT_CONFIGURED") {
      console.error("[error] SMTP is not fully configured. Set SMTP_USER, SMTP_PASS, and SMTP_FROM.");
    } else if (message === "SMTP_AUTH_FAILED") {
      console.error("[error] SMTP authentication failed. Check SMTP credentials/app password.");
    } else if (message === "SMTP_CONNECTION_FAILED") {
      console.error("[error] SMTP connection failed. Check host/port/security and firewall rules.");
    } else if (message === "EMAIL_CONTENT_REQUIRED") {
      console.error("[error] Email content is required.");
    } else {
      console.error(`[error] ${message}`);
    }
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

await main();
