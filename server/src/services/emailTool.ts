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
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
};

export async function eamilToolExecute(
  { to, subject, body, attachments = [] }: EmailInput,
  ctx: Record<string, any> = {}
) {
  try {
    const mailOptions: any = {
      to,
      from: process.env.FROM_MAIL,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        path: att.path,
      }));
    }

    console.log(
      `📎 Attaching ${attachments.length} file(s):`,
      attachments.map((a) => a.filename).join(", ")
    );

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully:", info.messageId);

    return {
      sent: true,
      message: info.messageId,
      raw: info,
    };
  } catch (err: any) {
    console.error("❌ Email sending failed:", err.message);
    throw new Error(`Failed to send email: ${err.message}`);
  }
}
