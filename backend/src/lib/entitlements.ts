import { Plan } from '@prisma/client';
import { prisma } from '../config/db';

export interface PlanLimits {
  scansTotal: number | null;
  scansPerMonth: number | null;
  seats: number | null;
  bulkPerMonth: number | null;
  seatPriceInr?: number;
}

export interface Entitlement {
  plan: Plan;
  limits: PlanLimits;
  features: string[];
  source: 'user' | 'org' | 'default';
  periodEnd: Date | null;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function activeSub(where: { userId?: string; orgId?: string }) {
  return prisma.subscription.findFirst({
    where: {
      ...where,
      status: 'ACTIVE',
      OR: [{ periodEnd: null }, { periodEnd: { gt: new Date() } }],
    },
    include: { plan: true },
    orderBy: { plan: { sortOrder: 'desc' } },
  });
}

/** Resolve the plan in effect: org subscription wins over a personal one, else Free. */
export async function getEntitlement(user: { id: string; orgId: string | null; role: string }): Promise<Entitlement> {
  const [orgSub, userSub] = await Promise.all([
    user.orgId ? activeSub({ orgId: user.orgId }) : null,
    activeSub({ userId: user.id }),
  ]);
  const sub = [orgSub, userSub]
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.plan.sortOrder - a.plan.sortOrder)[0];

  let plan: Plan;
  if (user.role === 'SUPER_ADMIN') {
    plan = (await prisma.plan.findUnique({ where: { code: 'enterprise' } }))!;
  } else if (sub) {
    plan = sub.plan;
  } else {
    plan = (await prisma.plan.findUnique({ where: { code: 'free' } }))!;
  }

  return {
    plan,
    limits: plan.limits as unknown as PlanLimits,
    features: plan.features as unknown as string[],
    source: user.role === 'SUPER_ADMIN' ? 'default' : sub ? (sub === orgSub ? 'org' : 'user') : 'default',
    periodEnd: sub?.periodEnd ?? null,
  };
}

export async function getUsage(user: { id: string; orgId: string | null }) {
  const since = startOfMonth();
  const [scansTotal, scansThisMonth, orgBulkThisMonth] = await Promise.all([
    prisma.scan.count({ where: { userId: user.id, bulk: false } }),
    prisma.scan.count({ where: { userId: user.id, bulk: false, createdAt: { gte: since } } }),
    user.orgId ? prisma.scan.count({ where: { orgId: user.orgId, bulk: true, createdAt: { gte: since } } }) : 0,
  ]);
  return { scansTotal, scansThisMonth, orgBulkThisMonth };
}

export async function seatInfo(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const sub = await activeSub({ orgId });
  const base = sub ? (sub.plan.limits as unknown as PlanLimits).seats : 1;
  const used = await prisma.user.count({ where: { orgId } });
  const pending = await prisma.invite.count({ where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } } });
  const total = base === null ? null : base + (org?.extraSeats ?? 0);
  return { total, used, pending, plan: sub?.plan ?? null };
}
