import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.NOTIFY_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
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
