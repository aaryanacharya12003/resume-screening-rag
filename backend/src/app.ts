import dotenv from 'dotenv';
dotenv.config();

import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fileUpload from 'express-fileupload';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import authRouter from './routes/auth';
import scansRouter from './routes/scans';
import chatRouter from './routes/chat';
import billingRouter, { webhookRouter } from './routes/billing';
import orgRouter from './routes/org';
import adminRouter from './routes/admin';
import helmet from 'helmet';
import { HttpError } from './lib/http';
import { apiGeneral } from './lib/rateLimit';

// The Express app on its own: server.ts runs it as a long-lived server, api/index.js (Vercel) as a function.
const app = express();

// Behind a load balancer / reverse proxy, set TRUST_PROXY=1 so rate limits see the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');
// Security headers. This is a JSON API (the SPA is served separately), so a strict CSP costs nothing.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
// Webhook must see the raw body for signature verification, so it goes before express.json().
app.use('/api/billing/webhook', webhookRouter);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
  }),
);

app.use('/api', apiGeneral);
app.use('/api/auth', authRouter);
app.use('/api/scans', scansRouter);
app.use('/api/chat', chatRouter);
app.use('/api/billing', billingRouter);
app.use('/api/org', orgRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Unknown API paths get JSON like every other API error (not Express's HTML page).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (typeof err?.status === 'number' && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('❌', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
