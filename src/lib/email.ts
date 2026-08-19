/**
 * SMTP email (iCloud, Gmail, etc.) via Nodemailer.
 * Configure with SMTP_HOST / SMTP_USER / SMTP_PASS / EMAIL_FROM.
 */

import nodemailer from "nodemailer";

export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "MealWorks <noreply@localhost>"
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      // App passwords may be pasted with spaces/hyphens
      pass: process.env.SMTP_PASS!.replace(/[\s-]+/g, ""),
    },
  });
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email not configured (set SMTP_* in .env)" };
  }
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid recipient email" };
  }

  try {
    const transport = createTransport();
    const info = await transport.sendMail({
      from: fromAddress(),
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    console.error("[email]", msg);
    return { ok: false, error: msg };
  }
}
