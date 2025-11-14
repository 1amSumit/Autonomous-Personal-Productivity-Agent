import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_PORT || "465") === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

type EmailInput = {
  to: string;
  subject: string;
  body: string;
};

export async function eamilToolExecute(
  { to, subject, body }: EmailInput,
  ctx = {}
) {
  const info = await transporter.sendMail({
    to,
    from: process.env.FROM_MAIL,
    subject,
    text: body,
    html: body,
  });

  return {
    sent: true,
    message: info.messageId,
    raw: info,
  };
}
