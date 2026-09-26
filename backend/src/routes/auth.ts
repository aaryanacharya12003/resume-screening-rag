import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AUTH_COOKIE, readAuthToken, requireAuth, revokeToken, setAuthCookie, signToken } from '../middleware/auth';
import * as limits from '../lib/rateLimit';
import { getEntitlement, getUsage, seatInfo } from '../lib/entitlements';
import { ah, HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { appUrl, sendPasswordReset } from '../lib/mailer';
import { issueVerificationCode, resendWaitSeconds, verifyCode } from '../lib/emailOtp';

const router = Router();

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'org';

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  accountType: z.enum(['individual', 'team']).default('individual'),
  companyName: z.string().trim().optional(),
  inviteToken: z.string().optional(),
});

function publicUser(u: { id: string; email: string; name: string; role: string; orgId: string | null; createdAt: Date; emailVerifiedAt: Date | null }) {
  const { id, email, name, role, orgId, createdAt } = u;
  return { id, email, name, role, orgId, createdAt, emailVerified: Boolean(u.emailVerifiedAt) };
}

router.post(
  '/register',
  limits.register,
  ah(async (req, res) => {
    const data = registerSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(data.password, 10);

    let orgId: string | null = null;
    let role: 'USER' | 'ORG_ADMIN' = 'USER';
    // An invite link was emailed to this address, so opening it already proves the address.
    let verified = false;

    if (data.inviteToken) {
      const invite = await prisma.invite.findUnique({ where: { token: data.inviteToken } });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new HttpError(400, 'Invite is invalid or expired');
      if (invite.email.toLowerCase() !== data.email) throw new HttpError(400, 'This invite was sent to a different email');
      orgId = invite.orgId;
      role = invite.role === 'ORG_ADMIN' ? 'ORG_ADMIN' : 'USER';
      verified = true;
      await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    } else if (data.accountType === 'team') {
      if (!data.companyName) throw new HttpError(400, 'Company name is required for a team account');
      let slug = slugify(data.companyName);
      if (await prisma.organization.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const org = await prisma.organization.create({ data: { name: data.companyName, slug } });
      orgId = org.id;
      role = 'ORG_ADMIN';
    }

    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash, orgId, role, lastLoginAt: new Date(), emailVerifiedAt: verified ? new Date() : null },
    });
    await audit(user.id, 'user.register', user.email, { role, orgId });
    if (!verified) {
      // A failed email doesn't block sign-up: the verify page can send another code.
      await issueVerificationCode(user).catch((e) => console.error('Verification email failed:', e?.message || e));
    }
    setAuthCookie(res, signToken(user.id));
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/login',
  limits.loginPerIp,
  limits.loginPerAccount,
  ah(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
    if (user.suspended) throw new HttpError(403, 'Your account is suspended');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    setAuthCookie(res, signToken(user.id));
    res.json({ user: publicUser(user) });
  }),
);

const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Always answers the same way so the endpoint can't be used to discover accounts. */
router.post(
  '/forgot-password',
  limits.forgotPassword,
  ah(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.suspended) {
      // One email per minute per account.
      const recent = await prisma.passwordReset.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
      });
      if (!recent) {
        const token = crypto.randomBytes(32).toString('hex');
        await prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
        });
        await sendPasswordReset(user.email, user.name, appUrl(`/reset-password/${token}`)).catch((e) =>
          console.error('Password reset email failed:', e?.message || e),
        );
        await audit(user.id, 'user.password_reset_requested', user.email);
      }
    }
    res.json({ ok: true });
  }),
);

async function findValidReset(token: string) {
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || reset.user.suspended) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  }
  return reset;
}

router.get(
  '/reset-password/:token',
  ah(async (req, res) => {
    const reset = await findValidReset(req.params.token);
    res.json({ email: reset.user.email });
  }),
);

router.post(
  '/reset-password',
  ah(async (req, res) => {
    const { token, password } = z
      .object({ token: z.string().min(10), password: z.string().min(8, 'Password must be at least 8 characters') })
      .parse(req.body);
    const reset = await findValidReset(token);
    const now = new Date();
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        // passwordChangedAt signs out every session issued before this moment.
        // The reset link was emailed, so using it also verifies the address.
        data: { passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: now, lastLoginAt: now, emailVerifiedAt: reset.user.emailVerifiedAt ?? now },
      }),
      prisma.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: now } }),
    ]);
    await audit(user.id, 'user.password_reset', user.email);
    setAuthCookie(res, signToken(user.id));
    res.json({ user: publicUser(user) });
  }),
);

/** Confirms the sign-up email with the 6-digit code. */
router.post(
  '/verify-email',
  limits.verifyEmail,
  requireAuth,
  ah(async (req, res) => {
    const user = req.user!;
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email') }).parse(req.body);
    await verifyCode(user.id, code);
    await audit(user.id, 'user.email_verified', user.email);
    res.json({ ok: true });
  }),
);

/** Sends a fresh code (at most one a minute per account). */
router.post(
  '/resend-code',
  limits.resendCode,
  requireAuth,
  ah(async (req, res) => {
    const user = req.user!;
    if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });
    const wait = await resendWaitSeconds(user.id);
    if (wait > 0) throw new HttpError(429, `Please wait ${wait} seconds before asking for another code.`, 'RESEND_WAIT');
    const { delivered } = await issueVerificationCode(user);
    res.json({ ok: true, emailed: delivered });
  }),
);

router.post(
  '/logout',
  ah(async (req, res) => {
    // Revoke server-side too: clearing the cookie alone leaves a copied token usable until it expires.
    await revokeToken(readAuthToken(req));
    res.clearCookie(AUTH_COOKIE);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = req.user!;
    const [ent, usage, org] = await Promise.all([
      getEntitlement(user),
      getUsage(user),
      user.orgId ? prisma.organization.findUnique({ where: { id: user.orgId } }) : null,
    ]);
    res.json({
      user: publicUser(user),
      org: org && { id: org.id, name: org.name, slug: org.slug, seats: await seatInfo(org.id) },
      plan: {
        code: ent.plan.code,
        name: ent.plan.name,
        limits: ent.limits,
        features: ent.features,
        source: ent.source,
        periodEnd: ent.periodEnd,
      },
      usage,
    });
  }),
);

router.get(
  '/invite/:token',
  ah(async (req, res) => {
    const invite = await prisma.invite.findUnique({ where: { token: req.params.token }, include: { org: true } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new HttpError(404, 'Invite is invalid or expired');
    res.json({ email: invite.email, orgName: invite.org.name, role: invite.role });
  }),
);

/** Existing user joins an org from an invite link. */
router.post(
  '/invite/:token/accept',
  requireAuth,
  ah(async (req, res) => {
    const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new HttpError(404, 'Invite is invalid or expired');
    if (invite.email.toLowerCase() !== req.user!.email) throw new HttpError(400, 'This invite was sent to a different email');
    if (req.user!.role === 'SUPER_ADMIN') throw new HttpError(400, 'Super admins cannot join an organization');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user!.id },
        data: { orgId: invite.orgId, role: invite.role === 'ORG_ADMIN' ? 'ORG_ADMIN' : 'USER' },
      }),
      prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  }),
);

export default router;
