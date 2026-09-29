import { Router, raw } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Payment } from '@prisma/client';
import { prisma } from '../config/db';
import { razorpay, razorpayEnabled } from '../config/razorpay';
import { requireAuth } from '../middleware/auth';
import { PlanLimits } from '../lib/entitlements';
import { ah, HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import * as limits from '../lib/rateLimit';

const router = Router();

// Without Razorpay keys (local dev) checkout is simulated so the whole flow stays testable.
const devCheckout = () => !razorpayEnabled && process.env.NODE_ENV !== 'production';

router.get(
  '/plans',
  ah(async (_req, res) => {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
    res.json({
      plans: plans.map(({ updatedAt, ...p }) => p),
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
      devCheckout: devCheckout(),
    });
  }),
);

router.post(
  '/contact-sales',
  limits.contactSales,
  ah(async (req, res) => {
    // Honeypot: a hidden field real visitors never fill. Bots get the normal answer but nothing is stored.
    if (typeof req.body?.website === 'string' && req.body.website.trim()) return res.status(201).json({ ok: true });
    const data = z
      .object({
        name: z.string().trim().min(2),
        email: z.string().trim().email(),
        company: z.string().trim().min(2),
        seats: z.coerce.number().int().positive().optional(),
        message: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    await prisma.contactLead.create({ data });
    res.status(201).json({ ok: true });
  }),
);

/** General contact form (support, billing, privacy…). Stored with the sales leads for the admin panel. */
router.post(
  '/contact',
  limits.contactSales,
  ah(async (req, res) => {
    // Honeypot: a hidden field real visitors never fill. Bots get the normal answer but nothing is stored.
    if (typeof req.body?.website === 'string' && req.body.website.trim()) return res.status(201).json({ ok: true });
    const data = z
      .object({
        name: z.string({ required_error: 'Please enter your name' }).trim().min(2, 'Please enter your name').max(100),
        email: z.string({ required_error: 'Please enter your email' }).trim().email('Please enter a valid email'),
        topic: z.enum(['Support', 'Billing and refunds', 'Sales and teams', 'Privacy and data', 'Something else']).default('Support'),
        message: z.string({ required_error: 'Please write your message' }).trim().min(10, 'Please write a little more so we can help').max(2000),
      })
      .parse(req.body);
    await prisma.contactLead.create({
      data: { name: data.name, email: data.email, company: `Contact: ${data.topic}`, message: data.message },
    });
    res.status(201).json({ ok: true });
  }),
);

/** Grants what a paid payment bought. Idempotent: only acts on the CREATED → PAID transition. */
export async function activatePayment(payment: Payment, razorpayPaymentId: string) {
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'CREATED' },
    data: { status: 'PAID', razorpayPaymentId },
  });
  if (updated.count === 0) return;

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: payment.planId } });

  if (payment.cycle.startsWith('seats:')) {
    const seats = Number(payment.cycle.split(':')[1]);
    await prisma.organization.update({ where: { id: payment.orgId! }, data: { extraSeats: { increment: seats } } });
  } else if (plan.code === 'pro') {
    await prisma.subscription.create({ data: { planId: plan.id, userId: payment.userId, status: 'ACTIVE' } });
  } else if (plan.code === 'team') {
    // Extend the current period if one is running, otherwise start now.
    const current = await prisma.subscription.findFirst({
      where: { orgId: payment.orgId!, planId: plan.id, status: 'ACTIVE', periodEnd: { gt: new Date() } },
      orderBy: { periodEnd: 'desc' },
    });
    const from = current?.periodEnd ?? new Date();
    const periodEnd = new Date(from);
    if (payment.cycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
    if (current) await prisma.subscription.update({ where: { id: current.id }, data: { periodEnd } });
    else await prisma.subscription.create({ data: { planId: plan.id, orgId: payment.orgId!, status: 'ACTIVE', periodEnd } });
  }
  await audit(payment.userId, 'payment.paid', payment.id, { plan: plan.code, amount: payment.amountInr, cycle: payment.cycle });
}

router.post(
  '/checkout',
  requireAuth,
  ah(async (req, res) => {
    const user = req.user!;
    const { planCode, cycle, seats } = z
      .object({
        planCode: z.enum(['pro', 'team', 'seats']),
        cycle: z.enum(['one_time', 'monthly', 'yearly']).default('one_time'),
        seats: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(req.body);

    let amountInr: number;
    let paymentCycle: string;
    const plan = await prisma.plan.findUnique({ where: { code: planCode === 'seats' ? 'team' : planCode } });
    if (!plan || !plan.active) throw new HttpError(404, 'Plan not available');

    if (planCode === 'pro') {
      amountInr = plan.priceInr;
      paymentCycle = 'one_time';
    } else {
      if (user.role !== 'ORG_ADMIN' || !user.orgId) {
        throw new HttpError(403, 'Only an organization admin can buy a Team plan. Create a team account first.');
      }
      if (planCode === 'seats') {
        if (!seats) throw new HttpError(400, 'How many seats?');
        amountInr = seats * ((plan.limits as unknown as PlanLimits).seatPriceInr ?? 499);
        paymentCycle = `seats:${seats}`;
      } else {
        paymentCycle = cycle === 'yearly' ? 'yearly' : 'monthly';
        amountInr = paymentCycle === 'yearly' ? plan.yearlyPriceInr ?? plan.priceInr * 10 : plan.priceInr;
      }
    }

    const payment = await prisma.payment.create({
      data: { amountInr, planId: plan.id, userId: user.id, orgId: user.orgId, cycle: paymentCycle },
    });

    if (devCheckout()) {
      return res.json({ devMode: true, paymentId: payment.id, amountInr, planName: plan.name });
    }
    if (!razorpay) throw new HttpError(503, 'Payments are not configured');

    const order = await razorpay.orders.create({
      amount: amountInr * 100,
      currency: 'INR',
      receipt: payment.id.slice(0, 40),
      notes: { paymentId: payment.id, plan: plan.code, cycle: paymentCycle },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { razorpayOrderId: order.id } });
    res.json({
      devMode: false,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: 'INR',
      planName: plan.name,
      prefill: { name: user.name, email: user.email },
    });
  }),
);

router.post(
  '/verify',
  requireAuth,
  ah(async (req, res) => {
    const body = req.body as Record<string, string>;
    if (body.devPaymentId) {
      if (!devCheckout()) throw new HttpError(400, 'Dev checkout is disabled');
      const payment = await prisma.payment.findFirst({ where: { id: body.devPaymentId, userId: req.user!.id } });
      if (!payment) throw new HttpError(404, 'Payment not found');
      await activatePayment(payment, `dev_${Date.now()}`);
      return res.json({ ok: true });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = z
      .object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() })
      .parse(body);
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const ok =
      expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!ok) throw new HttpError(400, 'Payment signature mismatch');

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
    if (!payment || payment.userId !== req.user!.id) throw new HttpError(404, 'Payment not found');
    await activatePayment(payment, razorpay_payment_id);
    res.json({ ok: true });
  }),
);

/**
 * Settles payments whose checkout finished but whose confirmation never reached us
 * (browser closed before /verify, webhook not configured). Asks Razorpay directly.
 */
router.post(
  '/reconcile',
  requireAuth,
  ah(async (req, res) => {
    if (!razorpay) return res.json({ activated: 0 });
    const pending = await prisma.payment.findMany({
      where: {
        userId: req.user!.id,
        status: 'CREATED',
        razorpayOrderId: { not: null },
        createdAt: { gt: new Date(Date.now() - 7 * 86400e3) },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    let activated = 0;
    for (const payment of pending) {
      try {
        const { items } = (await razorpay.orders.fetchPayments(payment.razorpayOrderId!)) as unknown as {
          items: { id: string; status: string }[];
        };
        const captured = items.find((p) => p.status === 'captured');
        if (captured) {
          await activatePayment(payment, captured.id);
          activated++;
        }
      } catch (e: any) {
        console.error('Reconcile failed for', payment.razorpayOrderId, e?.error?.description || e?.message || e);
      }
    }
    res.json({ activated });
  }),
);

router.get(
  '/history',
  requireAuth,
  ah(async (req, res) => {
    const user = req.user!;
    const where =
      user.role === 'ORG_ADMIN' && user.orgId ? { OR: [{ userId: user.id }, { orgId: user.orgId }] } : { userId: user.id };
    const payments = await prisma.payment.findMany({
      where: { ...where, status: { not: 'CREATED' } },
      include: { plan: { select: { name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(payments);
  }),
);

export default router;

/** Razorpay webhook: mounted with a raw body parser so the signature can be checked. */
export const webhookRouter = Router();
webhookRouter.post(
  '/',
  raw({ type: 'application/json' }),
  ah(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'Webhook secret not configured');
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (!signature || signature !== expected) throw new HttpError(400, 'Bad signature');

    const event = JSON.parse(req.body.toString());
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload.payment?.entity;
      const payment = entity?.order_id
        ? await prisma.payment.findUnique({ where: { razorpayOrderId: entity.order_id } })
        : null;
      if (payment) await activatePayment(payment, entity.id);
    } else if (event.event === 'payment.failed') {
      const orderId = event.payload.payment?.entity?.order_id;
      if (orderId) await prisma.payment.updateMany({ where: { razorpayOrderId: orderId, status: 'CREATED' }, data: { status: 'FAILED' } });
    }
    res.json({ ok: true });
  }),
);
