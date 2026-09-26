import { PrismaClient, PlanInterval } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

const plans = [
  {
    code: 'free',
    name: 'Free scan',
    tagline: 'See where you stand in under a minute.',
    priceInr: 0,
    interval: PlanInterval.FREE,
    audience: 'individual',
    sortOrder: 0,
    limits: { scansTotal: 1, scansPerMonth: null, seats: 1, bulkPerMonth: 0 },
    features: [],
    bullets: ['Overall resume score', 'Top 3 issues', 'ATS format check', '!Bullet rewrites', '!Job-description matching', '!AI recruiter chat'],
  },
  {
    code: 'pro',
    name: 'Pro',
    tagline: 'Everything, for every version of your resume.',
    priceInr: 99,
    interval: PlanInterval.ONE_TIME,
    audience: 'individual',
    highlight: true,
    sortOrder: 1,
    limits: { scansTotal: null, scansPerMonth: null, seats: 1, bulkPerMonth: 0 },
    features: ['chat', 'rewrites', 'jdMatch', 'history', 'fullReport'],
    bullets: ['All 30+ checks', 'Line-by-line bullet rewrites', 'Job-description matching', 'AI recruiter chat (RAG)', 'Unlimited re-scans + version compare'],
  },
  {
    code: 'team',
    name: 'Team',
    tagline: 'For recruiters and hiring teams screening at volume.',
    priceInr: 2999,
    yearlyPriceInr: 29990,
    interval: PlanInterval.MONTHLY,
    audience: 'team',
    sortOrder: 2,
    limits: { scansTotal: null, scansPerMonth: null, seats: 5, bulkPerMonth: 500, seatPriceInr: 499 },
    features: ['chat', 'rewrites', 'jdMatch', 'history', 'fullReport', 'bulk', 'export', 'team'],
    bullets: ['Everything in Pro for every seat', '5 recruiter seats (+₹499/seat)', 'Job postings & bulk JD screening', '500 resumes / month, ranked', 'CSV export & team usage'],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    tagline: 'Unlimited volume, security reviews and a real SLA.',
    priceInr: 0,
    interval: PlanInterval.CUSTOM,
    audience: 'team',
    sortOrder: 3,
    limits: { scansTotal: null, scansPerMonth: null, seats: null, bulkPerMonth: null },
    features: ['chat', 'rewrites', 'jdMatch', 'history', 'fullReport', 'bulk', 'export', 'team', 'api', 'sso', 'whiteLabel'],
    bullets: ['Unlimited seats & screening', 'SSO / SAML & audit logs', 'REST API access', 'White-label reports', 'Dedicated CSM + 99.9% SLA'],
  },
];

async function main() {
  for (const p of plans) {
    await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  console.log(`✓ ${plans.length} plans`);

  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'SUPER_ADMIN' },
      create: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`✓ super admin ${email}`);
  } else {
    console.log('! SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set, skipping super admin');
  }
}

main().finally(() => prisma.$disconnect());
