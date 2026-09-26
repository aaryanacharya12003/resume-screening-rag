import nodemailer, { Transporter } from 'nodemailer';

// SMTP works with Gmail (app password), Brevo, Resend, SES, Mailgun, Zoho, etc.
// Without SMTP_HOST, emails are printed to the server log so dev flows still work.
let transporter: Transporter | null = null;
export const mailEnabled = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransport() {
  if (!transporter && mailEnabled()) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export const appUrl = (path: string) => `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')}${path}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Resumint-styled email: cream background, bordered card, yellow CTA with a hard shadow. */
export function layout(opts: { heading: string; body: string[]; cta?: { label: string; url: string }; code?: string; footnote: string }) {
  const paras = opts.body.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#5A5D7E">${p}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F5F6FC;font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif;color:#1C1B3F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FC;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px;font-weight:800;font-size:18px"><span style="display:inline-block;width:14px;height:14px;border-radius:5px;background:#6EF0C2;border:2px solid #1C1B3F;vertical-align:-2px;margin-right:6px"></span>Resumint</td></tr>
<tr><td style="background:#FFFFFF;border:2.4px solid #1C1B3F;border-radius:18px;box-shadow:4px 4px 0 0 #1C1B3F;padding:32px">
<h1 style="margin:0 0 16px;font-family:Fraunces,Georgia,serif;font-weight:500;font-size:30px;line-height:1.15">${opts.heading}</h1>
${paras}
${opts.code ? `<div style="margin:8px 0 18px;display:inline-block;background:#6EF0C2;border:2.4px solid #1C1B3F;border-radius:14px;box-shadow:4px 4px 0 0 #1C1B3F;padding:14px 22px;font-family:Consolas,Menlo,monospace;font-weight:700;font-size:32px;letter-spacing:10px;color:#1C1B3F">${opts.code}</div>` : ''}
${opts.cta ? `<a href="${opts.cta.url}" style="display:inline-block;margin:8px 0 18px;background:#6EF0C2;color:#1C1B3F;border:2.4px solid #1C1B3F;border-radius:999px;padding:13px 24px;font-weight:700;font-size:15px;text-decoration:none;box-shadow:4px 4px 0 0 #1C1B3F">${opts.cta.label} &rarr;</a>
<p style="margin:0;font-size:12px;color:#A2A6C4;word-break:break-all">Or paste this link into your browser:<br>${opts.cta.url}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:12px;color:#A2A6C4">${opts.footnote}</td></tr>
</table></td></tr></table></body></html>`;
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  const t = getTransport();
  if (!t) {
    console.log(`\n📧 [email not sent: SMTP not configured]\n   to: ${to}\n   subject: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
    return { delivered: false };
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
  return { delivered: true };
}

export function sendPasswordReset(to: string, name: string, url: string) {
  return sendMail(
    to,
    'Reset your Resumint password',
    layout({
      heading: 'Reset your password',
      body: [`Hi ${esc(name.split(' ')[0])},`, 'Someone (hopefully you) asked to reset the password for your Resumint account. This link works once and expires in 1 hour.'],
      cta: { label: 'Choose a new password', url },
      footnote: "Didn't ask for this? You can ignore this email; your password stays the same.",
    }),
    `Reset your Resumint password (link expires in 1 hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  );
}

export function sendVerificationCode(to: string, name: string, code: string) {
  return sendMail(
    to,
    `${code} is your Resumint verification code`,
    layout({
      heading: 'Confirm your email',
      body: [`Hi ${esc(name.split(' ')[0])},`, 'Enter this code on the Resumint sign-up page to confirm your email. It expires in 10 minutes.'],
      code,
      footnote: "Didn't sign up for Resumint? You can ignore this email; the account won't be activated.",
    }),
    `Your Resumint verification code is ${code}\nIt expires in 10 minutes.\n\nIf you didn't sign up, ignore this email.`,
  );
}

export function sendInvite(to: string, inviterName: string, orgName: string, role: string, url: string) {
  const roleText = role === 'ORG_ADMIN' ? 'an admin' : 'a recruiter';
  return sendMail(
    to,
    `${inviterName} invited you to ${orgName} on Resumint`,
    layout({
      heading: `Join <span style="background:linear-gradient(transparent 12%,#6EF0C2 12% 88%,transparent 88%)">${esc(orgName)}</span>`,
      body: [
        `${esc(inviterName)} invited you to join <b style="color:#1C1B3F">${esc(orgName)}</b> on Resumint as ${roleText}.`,
        'Resumint ranks applicants against your job descriptions with AI, so your team can shortlist faster.',
      ],
      cta: { label: 'Accept invite', url },
      footnote: 'This invite expires in 7 days. If you were not expecting it, you can ignore this email.',
    }),
    `${inviterName} invited you to join ${orgName} on Resumint as ${roleText}.\nAccept: ${url}\n(expires in 7 days)`,
  );
}
