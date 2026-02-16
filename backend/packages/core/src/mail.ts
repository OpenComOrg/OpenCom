import nodemailer from "nodemailer";
import { env } from "./env.js";

function ensureSmtpConfigured() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
}

function getTransporter() {
  ensureSmtpConfigured();
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!
    }
  });
}

export async function sendVerificationEmail(to: string, verifyToken: string) {
  const transporter = getTransporter();
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const verifyUrl = `${base}/?verifyEmailToken=${encodeURIComponent(verifyToken)}`;

  await transporter.sendMail({
    from: env.SMTP_FROM!,
    to,
    subject: "Verify your OpenCom account",
    text: `Welcome to OpenCom.\n\nVerify your email by opening this link:\n${verifyUrl}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<p>Welcome to OpenCom.</p><p>Verify your email by opening this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you did not create this account, you can ignore this email.</p>`
  });
}
