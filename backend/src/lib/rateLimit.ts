import { Request } from 'express';
import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';

// RATE_LIMIT_DISABLED=1 turns every limiter off (automated test servers); never set it in production.
const disabled = () => process.env.RATE_LIMIT_DISABLED === '1';

const make = (opts: Partial<Options> & { message: string }) =>
  rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: disabled,
    ...opts,
    handler: (_req, res, _next, options) =>
      res.status(options.statusCode).json({ error: opts.message, code: 'RATE_LIMITED' }),
  });

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
const emailOf = (req: Request) => String(req.body?.email ?? '').trim().toLowerCase();

/** Password guessing on one account: 10 failed attempts per 15 min per IP + email. */
export const loginPerAccount = make({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ip(req)}|${emailOf(req)}`,
  message: 'Too many failed sign-in attempts. Wait 15 minutes and try again, or reset your password.',
});

/** Credential stuffing across many accounts from one IP. */
export const loginPerIp = make({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  skipSuccessfulRequests: true,
  keyGenerator: ip,
  message: 'Too many sign-in attempts from this network. Try again in a few minutes.',
});

export const forgotPassword = make({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: ip,
  message: 'Too many password reset requests. Try again in an hour.',
});

export const register = make({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: ip,
  message: 'Too many accounts created from this network. Try again later.',
});

export const contactSales = make({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: ip,
  message: 'Thanks, we already have your request. Please wait before sending another.',
});

/** Broad ceiling for everything under /api. */
export const apiGeneral = make({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: ip,
  message: 'Too many requests. Slow down and try again in a minute.',
});
