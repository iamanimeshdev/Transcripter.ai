// utils/email.js
import fs from "fs";
import path from "path";
import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) throw new Error("SENDGRID_API_KEY not set");

sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendEmail({ to = process.env.EMAIL_TO, subject, text, attachments = [] }) {
  const formattedAttachments = attachments.map(att => {
    // CASE 1: memory-only attachment using "content" (base64 string)
    if (att.content) {
      return {
        filename: att.filename,
        type: att.type || "application/octet-stream",
        disposition: "attachment",
        content: att.content // already base64
      };
    }

    // CASE 2: memory-only attachment using Buffer
    if (att.buffer) {
      return {
        filename: att.filename,
        type: att.type || "application/octet-stream",
        disposition: "attachment",
        content: att.buffer.toString("base64")
      };
    }

    // CASE 3: read from disk
    if (att.path) {
      const base64Content = fs.readFileSync(att.path).toString("base64");
      return {
        filename: att.filename || path.basename(att.path),
        type: att.type || undefined,
        disposition: "attachment",
        content: base64Content
      };
    }

    throw new Error("Attachment must have either content, buffer, or path.");
  });

  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject,
    text,
    attachments: formattedAttachments
  };

  await sgMail.send(msg);
  console.log("✅ Email sent via SendGrid to:", to);
}
