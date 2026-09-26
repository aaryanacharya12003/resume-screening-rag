import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { razorpay } from '../config/razorpay';
import { requireAuth, requireRole } from '../middleware/auth';
import { ah, HttpError } from '../lib/http';
import { audit } from '../lib/audit';

const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function daily<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number, days = 30) {
  const out: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) out[dayKey(new Date(Date.now() - i * DAY))] = 0;
  for (const r of rows) {
    const k = dayKey(date(r));
    if (k in out) out[k] += value(r);
  }
  return Object.entries(out).map(([date, v]) => ({ date, value: v }));
}

router.get(
  '/stats',
  ah(async (_req, res) => {
    const since = new Date(Date.now() - 30 * DAY);
    const [users, orgs, scans, paid, activeSubs, recentScans, recentPaid, recentUsers, leadsNew] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.scan.count(),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountInr: true } }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE', OR: [{ periodEnd: null }, { periodEnd: { gt: new Date() } }] },
        include: { plan: true },
      }),
      prisma.scan.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.payment.findMany({ where: { status: 'PAID', createdAt: { gte: since } }, select: { createdAt: true, amountInr: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.contactLead.count({ where: { status: 'new' } }),
    ]);

    // MRR counts recurring Team revenue from orgs that actually paid (admin comps are excluded);
    // one-time Pro purchases show up in revenue instead.
    const paidTeamOrgs = new Set(
      (
        await prisma.payment.findMany({
          where: { status: 'PAID', plan: { code: 'team' }, orgId: { not: null }, NOT: { cycle: { startsWith: 'seats:' } } },
          select: { orgId: true },
        })
      ).map((p) => p.orgId),
    );
    const mrr = activeSubs
      .filter((s) => s.plan.code === 'team' && paidTeamOrgs.has(s.orgId))
      .reduce((sum, s) => sum + s.plan.priceInr, 0);
    const planMix: Record<string, number> = {};
    for (const s of activeSubs) planMix[s.plan.name] = (planMix[s.plan.name] ?? 0) + 1;
    const payingIds = new Set(activeSubs.map((s) => s.userId ?? s.orgId));

    res.json({
      totals: {
        users,
        orgs,
        scans,
        revenueInr: paid._sum.amountInr ?? 0,
        revenue30dInr: recentPaid.reduce((s, p) => s + p.amountInr, 0),
        mrrInr: mrr,
        paying: payingIds.size,
        leadsNew,
      },
      planMix: Object.entries(planMix).map(([name, count]) => ({ name, count })),
      series: {
        scans: daily(recentScans, (r) => r.createdAt, () => 1),
        revenue: daily(recentPaid, (r) => r.createdAt, (r) => r.amountInr),
        signups: daily(recentUsers, (r) => r.createdAt, () => 1),
      },
    });
  }),
);

/* ---------- users ---------- */

router.get(
  '/users',
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const role = String(req.query.role ?? '');
    const where: Prisma.UserWhereInput = {
      ...(q && { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }),
      ...(['USER', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(role) && { role: role as any }),
    };
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, email: true, role: true, suspended: true, createdAt: true, lastLoginAt: true,
        org: { select: { id: true, name: true } },
        _count: { select: { scans: true } },
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { plan: { select: { name: true, code: true } } },
        },
      },
    });
    res.json(users);
  }),
);

router.patch(
  '/users/:id',
  ah(async (req, res) => {
    const data = z
      .object({ role: z.enum(['USER', 'ORG_ADMIN', 'SUPER_ADMIN']).optional(), suspended: z.boolean().optional() })
      .parse(req.body);
    if (req.params.id === req.user!.id) throw new HttpError(400, "You can't change your own account here");
    const target = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    if (data.role === 'ORG_ADMIN' && !target.orgId) throw new HttpError(400, 'User must belong to an organization to be its admin');
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    await audit(req.user!.id, 'admin.user.update', user.email, data);
    res.json({ ok: true });
  }),
);

const grantSchema = z.object({ planCode: z.enum(['pro', 'team', 'enterprise']), months: z.coerce.number().int().min(1).max(120).optional() });

async function grant(target: { userId?: string; orgId?: string }, planCode: string, months?: number) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: planCode } });
  // Replace any current grant so the new plan is the one in effect.
  await prisma.subscription.updateMany({ where: { ...target, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
  const periodEnd = months ? new Date(Date.now() + months * 30 * DAY) : null;
  return prisma.subscription.create({ data: { ...target, planId: plan.id, status: 'ACTIVE', periodEnd } });
}

router.post(
  '/users/:id/grant',
  ah(async (req, res) => {
    const { planCode, months } = grantSchema.parse(req.body);
    if (planCode !== 'pro') throw new HttpError(400, 'Team/Enterprise plans are granted to organizations');
    await grant({ userId: req.params.id }, planCode, months);
    await audit(req.user!.id, 'admin.user.grant', req.params.id, { planCode, months });
    res.json({ ok: true });
  }),
);

/* ---------- organizations ---------- */

router.get(
  '/orgs',
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const orgs = await prisma.organization.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        _count: { select: { members: true, scans: true, jobs: true } },
        subscriptions: {
          where: { status: 'ACTIVE', OR: [{ periodEnd: null }, { periodEnd: { gt: new Date() } }] },
          include: { plan: { select: { name: true, code: true } } },
        },
        members: { where: { role: 'ORG_ADMIN' }, select: { email: true }, take: 1 },
      },
    });
    res.json(orgs);
  }),
);

router.patch(
  '/orgs/:id',
  ah(async (req, res) => {
    const data = z
      .object({ suspended: z.boolean().optional(), extraSeats: z.coerce.number().int().min(0).max(10000).optional() })
      .parse(req.body);
    const org = await prisma.organization.update({ where: { id: req.params.id }, data });
    await audit(req.user!.id, 'admin.org.update', org.name, data);
    res.json({ ok: true });
  }),
);

router.post(
  '/orgs/:id/grant',
  ah(async (req, res) => {
    const { planCode, months } = grantSchema.parse(req.body);
    if (planCode === 'pro') throw new HttpError(400, 'Pro is a personal plan');
    await grant({ orgId: req.params.id }, planCode, months);
    await audit(req.user!.id, 'admin.org.grant', req.params.id, { planCode, months });
    res.json({ ok: true });
  }),
);

/* ---------- plans ---------- */

router.get(
  '/plans',
  ah(async (_req, res) => {
    res.json(await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }));
  }),
);

router.put(
  '/plans/:id',
  ah(async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(1),
        tagline: z.string().trim(),
        priceInr: z.coerce.number().int().min(0),
        yearlyPriceInr: z.coerce.number().int().min(0).nullable().optional(),
        highlight: z.boolean(),
        active: z.boolean(),
        bullets: z.array(z.string().trim().min(1)).max(12),
        limits: z.object({
          scansTotal: z.number().int().min(0).nullable(),
          scansPerMonth: z.number().int().min(0).nullable(),
          seats: z.number().int().min(1).nullable(),
          bulkPerMonth: z.number().int().min(0).nullable(),
          seatPriceInr: z.number().int().min(0).optional(),
        }),
      })
      .parse(req.body);
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data });
    await audit(req.user!.id, 'admin.plan.update', plan.code, { priceInr: plan.priceInr });
    res.json(plan);
  }),
);

/* ---------- payments, leads, audit ---------- */

router.get(
  '/payments',
  ah(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        plan: { select: { name: true } },
        user: { select: { email: true, name: true } },
        org: { select: { name: true } },
      },
    });
    res.json(payments);
  }),
);

router.post(
  '/payments/:id/refund',
  ah(async (req, res) => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: req.params.id } });
    if (payment.status !== 'PAID') throw new HttpError(400, 'Only paid payments can be refunded');
    if (razorpay && payment.razorpayPaymentId && !payment.razorpayPaymentId.startsWith('dev_')) {
      try {
        await razorpay.payments.refund(payment.razorpayPaymentId, { amount: payment.amountInr * 100 });
      } catch (e: any) {
        throw new HttpError(502, `Razorpay refused the refund: ${e?.error?.description || e?.message || 'unknown error'}`);
      }
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
    await audit(req.user!.id, 'admin.payment.refund', payment.id, { amount: payment.amountInr });
    res.json({ ok: true });
  }),
);

router.get(
  '/leads',
  ah(async (_req, res) => {
    res.json(await prisma.contactLead.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }));
  }),
);

router.patch(
  '/leads/:id',
  ah(async (req, res) => {
    const { status } = z.object({ status: z.enum(['new', 'contacted', 'won', 'lost']) }).parse(req.body);
    await prisma.contactLead.update({ where: { id: req.params.id }, data: { status } });
    res.json({ ok: true });
  }),
);

router.get(
  '/audit',
  ah(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { actor: { select: { email: true } } },
    });
    res.json(logs);
  }),
);

export default router;
