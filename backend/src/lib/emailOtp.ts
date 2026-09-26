import crypto from 'crypto';
import { prisma } from '../config/db';
import { HttpError } from './http';
import { sendVerificationCode } from './mailer';

// Sign-up email verification: a 6-digit code, valid for 10 minutes, 5 tries per code.
// Only a hash is stored (salted with the user id, so equal codes never share a hash).
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

const hashCode = (userId: string, code: string) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

/** Creates a new code (older ones stop working) and emails it. */
export async function issueVerificationCode(user: { id: string; email: string; name: string }) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.$transaction([
    prisma.emailVerification.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.emailVerification.create({
      data: { userId: user.id, codeHash: hashCode(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ]);
  return sendVerificationCode(user.email, user.name, code);
}

/** Seconds until another code may be sent (0 = now). */
export async function resendWaitSeconds(userId: string) {
  const last = await prisma.emailVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  if (!last) return 0;
  return Math.max(0, Math.ceil((last.createdAt.getTime() + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

/** Checks a code; on success marks the email verified. Throws a user-facing HttpError otherwise. */
export async function verifyCode(userId: string, code: string) {
  const row = await prisma.emailVerification.findFirst({ where: { userId, usedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, 'This code has expired. Send a new one.', 'CODE_EXPIRED');
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(400, 'Too many wrong tries. Send a new code.', 'CODE_LOCKED');

  const expected = Buffer.from(row.codeHash, 'hex');
  const given = Buffer.from(hashCode(userId, code), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    const updated = await prisma.emailVerification.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - updated.attempts;
    throw new HttpError(
      400,
      left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Send a new code.',
      left > 0 ? 'CODE_WRONG' : 'CODE_LOCKED',
    );
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: row.id }, data: { usedAt: now } }),
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }),
  ]);
}
