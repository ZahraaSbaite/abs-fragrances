/**
 * Email sending. Pick a provider in .env:
 *   EMAIL_PROVIDER=smtp    + SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (SMTP_SECURE=true for port 465)
 *                          Note: some free hosts (e.g. Render free tier) block outbound SMTP ports.
 *   EMAIL_PROVIDER=brevo   + BREVO_API_KEY   (free plan, works with just a verified sender address)
 *   EMAIL_PROVIDER=resend  + RESEND_API_KEY  (needs a verified domain to email customers)
 * EMAIL_FROM        = the sender address (must be verified with the provider)
 * EMAIL_FROM_NAME   = display name, default "Abs Fragrances"
 * sendMail never throws: a mail failure must never break an order or a status change.
 */
const PROVIDER = (process.env.EMAIL_PROVIDER || '').toLowerCase();
const FROM = process.env.EMAIL_FROM;
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Abs Fragrances';

let transporter = null;
function smtpTransport() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

function isConfigured() {
  if (!FROM) return false;
  if (PROVIDER === 'smtp') return !!process.env.SMTP_HOST;
  if (PROVIDER === 'brevo') return !!process.env.BREVO_API_KEY;
  if (PROVIDER === 'resend') return !!process.env.RESEND_API_KEY;
  return false;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) return false;
  if (!isConfigured()) {
    console.warn(`[mail] Email not configured (set EMAIL_PROVIDER, EMAIL_FROM and the SMTP settings or API key) — skipped "${subject}" to ${to}`);
    return false;
  }
  try {
    if (PROVIDER === 'smtp') {
      await smtpTransport().sendMail({
        from: `"${FROM_NAME}" <${FROM}>`, to, subject, html, text,
        ...(replyTo ? { replyTo } : {}),
      });
      return true;
    }
    let res;
    if (PROVIDER === 'brevo') {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM },
          to: [{ email: to }],
          subject, htmlContent: html, textContent: text,
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM}>`, to: [to], subject, html, text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
    }
    if (!res.ok) {
      console.error(`[mail] ${PROVIDER} rejected "${subject}" to ${to}:`, res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] Failed to send email:', err.message);
    return false;
  }
}

module.exports = { sendMail, isConfigured };
