import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role, User } from '@prisma/client';
import { prisma } from '../config/db';
import { getEntitlement } from '../lib/entitlements';
import { HttpError } from '../lib/http';

export const AUTH_COOKIE = 'rl_token';
const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-only-change-me';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function signToken(userId: string) {
  // jti identifies this session so logout can revoke exactly this token.
  return jwt.sign({ sub: userId }, JWT_SECRET(), { expiresIn: '7d', jwtid: crypto.randomUUID() });
}

/** Ends the session behind `token` server-side (the cookie alone can be copied before logout). */
export async function revokeToken(token: string | undefined) {
  if (!token) return;
  try {
    const p = jwt.verify(token, JWT_SECRET()) as { jti?: string; exp?: number };
    if (!p.jti) return;
    const expiresAt = new Date((p.exp ?? Math.floor(Date.now() / 1000) + 7 * 86400) * 1000);
    await prisma.revokedToken.upsert({ where: { jti: p.jti }, update: {}, create: { jti: p.jti, expiresAt } });
    // Opportunistic cleanup of rows whose tokens have expired anyway.
    await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* an invalid/expired token needs no revoking */
  }
}

export const readAuthToken = (req: Request) => readToken(req);

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE];
}

const UNVERIFIED_ALLOWED = new Set(['/api/auth/me', '/api/auth/verify-email', '/api/auth/resend-code', '/api/auth/logout']);

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Please sign in');
    const payload = jwt.verify(token, JWT_SECRET()) as { sub: string; iat: number; jti?: string };
    const [user, revoked] = await Promise.all([
      prisma.user.findUnique({ where: { id: payload.sub }, include: { org: true } }),
      payload.jti ? prisma.revokedToken.findUnique({ where: { jti: payload.jti } }) : null,
    ]);
    // Every token we issue carries a jti; one without it predates revocation support.
    if (!payload.jti || revoked) throw new HttpError(401, 'Your session ended. Please sign in again.');
    if (!user) throw new HttpError(401, 'Account not found');
    // Tokens issued before the last password change are revoked (iat is in seconds).
    if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new HttpError(401, 'Your password was changed. Please sign in again.');
    }
    if (user.suspended) throw new HttpError(403, 'Your account is suspended');
    if (!user.emailVerifiedAt && !UNVERIFIED_ALLOWED.has(req.originalUrl.split('?')[0].replace(/\/$/, ''))) {
      throw new HttpError(403, 'Please confirm your email first. We sent a 6-digit code to your inbox.', 'EMAIL_UNVERIFIED');
    }
    if (user.org?.suspended && user.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Your organization is suspended');
    req.user = user;
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Session expired, please sign in again'));
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this'));
    next();
  };

/** Org admin of their own org (super admins are not org-scoped and are rejected here). */
export function requireOrgAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.orgId || req.user.role !== 'ORG_ADMIN') return next(new HttpError(403, 'Organization admin access required'));
  next();
}

export const requireFeature =
  (feature: string) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ent = await getEntitlement(req.user!);
      if (!ent.features.includes(feature)) {
        throw new HttpError(402, `Your ${ent.plan.name} plan doesn't include this. Upgrade to unlock it.`, 'UPGRADE_REQUIRED');
      }
      next();
    } catch (e) {
      next(e);
    }
  };
