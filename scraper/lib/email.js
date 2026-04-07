import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER || process.env.NOTIFY_EMAIL,
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send an alert email.
 * @param {{ to: string[], subject: string, html: string }} opts
 */
export async function sendAlertEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: process.env.NOTIFY_EMAIL,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`  ❌ Email send failed: ${err.message}`);
    throw err;
  }
}
