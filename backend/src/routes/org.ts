import { Request, Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { UploadedFile } from 'express-fileupload';
import { prisma } from '../config/db';
import { requireAuth, requireFeature, requireOrgAdmin } from '../middleware/auth';
import { getEntitlement, seatInfo, startOfMonth } from '../lib/entitlements';
import { ah, HttpError } from '../lib/http';
import { audit } from '../lib/audit';
import { runScan } from '../services/scanService';
import { appUrl, sendInvite } from '../lib/mailer';

const router = Router();
router.use(requireAuth, requireOrgAdmin);

const orgId = (req: { user?: { orgId: string | null } }) => req.user!.orgId!;

router.get(
  '/',
  ah(async (req, res) => {
    const id = orgId(req);
    const since = startOfMonth();
    const [org, seats, ent, scansThisMonth, bulkThisMonth, openJobs, recent] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id } }),
      seatInfo(id),
      getEntitlement(req.user!),
      prisma.scan.count({ where: { orgId: id, createdAt: { gte: since } } }),
      prisma.scan.count({ where: { orgId: id, bulk: true, createdAt: { gte: since } } }),
      prisma.job.count({ where: { orgId: id, status: 'open' } }),
      prisma.scan.findMany({
        where: { orgId: id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { name: true } }, job: { select: { title: true } } },
      }),
    ]);
    res.json({
      org: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt },
      seats,
      plan: { code: ent.plan.code, name: ent.plan.name, limits: ent.limits, features: ent.features, periodEnd: ent.periodEnd },
      usage: { scansThisMonth, bulkThisMonth, openJobs },
      recent: recent.map((s) => ({
        id: s.id,
        candidateName: s.candidateName,
        fileName: s.fileName,
        score: s.score,
        by: s.user.name,
        job: s.job?.title ?? null,
        createdAt: s.createdAt,
      })),
    });
  }),
);

router.patch(
  '/',
  ah(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2) }).parse(req.body);
    const org = await prisma.organization.update({ where: { id: orgId(req) }, data: { name } });
    res.json(org);
  }),
);

/* ---------- team ---------- */

router.get(
  '/members',
  ah(async (req, res) => {
    const since = startOfMonth();
    const members = await prisma.user.findMany({
      where: { orgId: orgId(req) },
      select: { id: true, name: true, email: true, role: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const counts = await prisma.scan.groupBy({
      by: ['userId'],
      where: { orgId: orgId(req), createdAt: { gte: since } },
      _count: true,
    });
    const byUser = Object.fromEntries(counts.map((c) => [c.userId, c._count]));
    const invites = await prisma.invite.findMany({
      where: { orgId: orgId(req), acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      members: members.map((m) => ({ ...m, scansThisMonth: byUser[m.id] ?? 0 })),
      invites,
      seats: await seatInfo(orgId(req)),
    });
  }),
);

router.post(
  '/invites',
  ah(async (req, res) => {
    const { email, role } = z
      .object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['USER', 'ORG_ADMIN']).default('USER') })
      .parse(req.body);
    const seats = await seatInfo(orgId(req));
    if (seats.total !== null && seats.used + seats.pending >= seats.total) {
      throw new HttpError(402, 'All seats are in use. Buy more seats or upgrade your plan.', 'UPGRADE_REQUIRED');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.orgId === orgId(req)) throw new HttpError(409, 'This person is already on your team');
    if (existing?.orgId) throw new HttpError(409, 'This person already belongs to another organization');

    const invite = await prisma.invite.create({
      data: {
        email,
        role,
        orgId: orgId(req),
        token: crypto.randomBytes(24).toString('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await audit(req.user!.id, 'org.invite', email, { orgId: orgId(req), role });
    const emailed = await emailInvite(invite.id, req.user!.name);
    res.status(201).json({ ...invite, link: appUrl(`/invite/${invite.token}`), emailed });
  }),
);

/** Sends (or re-sends) the invite email. Returns whether it was actually delivered via SMTP. */
async function emailInvite(inviteId: string, inviterName: string) {
  const invite = await prisma.invite.findUniqueOrThrow({ where: { id: inviteId }, include: { org: true } });
  try {
    const { delivered } = await sendInvite(invite.email, inviterName, invite.org.name, invite.role, appUrl(`/invite/${invite.token}`));
    // lastSentAt means "actually delivered", so the UI never claims an email went out when it was only logged.
    if (delivered) await prisma.invite.update({ where: { id: invite.id }, data: { lastSentAt: new Date() } });
    return delivered;
  } catch (e: any) {
    console.error('Invite email failed:', e?.message || e);
    return false;
  }
}

router.post(
  '/invites/:id/resend',
  ah(async (req, res) => {
    const invite = await prisma.invite.findFirst({
      where: { id: req.params.id, orgId: orgId(req), acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!invite) throw new HttpError(404, 'Invite not found or already used');
    if (invite.lastSentAt && Date.now() - invite.lastSentAt.getTime() < 60 * 1000) {
      throw new HttpError(429, 'Invite was just sent. Try again in a minute.');
    }
    // Resending also pushes the expiry out another 7 days.
    await prisma.invite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    const emailed = await emailInvite(invite.id, req.user!.name);
    res.json({ ok: true, emailed });
  }),
);

router.delete(
  '/invites/:id',
  ah(async (req, res) => {
    await prisma.invite.deleteMany({ where: { id: req.params.id, orgId: orgId(req) } });
    res.json({ ok: true });
  }),
);

router.patch(
  '/members/:id',
  ah(async (req, res) => {
    const { role } = z.object({ role: z.enum(['USER', 'ORG_ADMIN']) }).parse(req.body);
    if (req.params.id === req.user!.id) throw new HttpError(400, "You can't change your own role");
    const r = await prisma.user.updateMany({ where: { id: req.params.id, orgId: orgId(req) }, data: { role } });
    if (!r.count) throw new HttpError(404, 'Member not found');
    await audit(req.user!.id, 'org.member.role', req.params.id, { role });
    res.json({ ok: true });
  }),
);

router.delete(
  '/members/:id',
  ah(async (req, res) => {
    if (req.params.id === req.user!.id) throw new HttpError(400, "You can't remove yourself");
    const r = await prisma.user.updateMany({
      where: { id: req.params.id, orgId: orgId(req) },
      data: { orgId: null, role: 'USER' },
    });
    if (!r.count) throw new HttpError(404, 'Member not found');
    await audit(req.user!.id, 'org.member.remove', req.params.id);
    res.json({ ok: true });
  }),
);

/* ---------- jobs + bulk screening ---------- */

const jobSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().min(30, 'Paste the full job description (30+ characters)'),
  status: z.enum(['open', 'closed']).optional(),
});

router.get(
  '/jobs',
  ah(async (req, res) => {
    const jobs = await prisma.job.findMany({
      where: { orgId: orgId(req) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { scans: true } } },
    });
    const avg = await prisma.scan.groupBy({ by: ['jobId'], where: { orgId: orgId(req), jobId: { not: null } }, _avg: { score: true }, _max: { score: true } });
    const byJob = Object.fromEntries(avg.map((a) => [a.jobId, a]));
    res.json(
      jobs.map((j) => ({
        ...j,
        candidates: j._count.scans,
        avgScore: Math.round(byJob[j.id]?._avg.score ?? 0),
        topScore: byJob[j.id]?._max.score ?? 0,
      })),
    );
  }),
);

router.post(
  '/jobs',
  ah(async (req, res) => {
    const data = jobSchema.parse(req.body);
    const job = await prisma.job.create({ data: { ...data, orgId: orgId(req) } });
    res.status(201).json(job);
  }),
);

async function ownJob(req: Request) {
  const job = await prisma.job.findFirst({ where: { id: req.params.id, orgId: orgId(req) } });
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

router.get(
  '/jobs/:id',
  ah(async (req, res) => {
    const job = await ownJob(req);
    const scans = await prisma.scan.findMany({
      where: { jobId: job.id },
      orderBy: { score: 'desc' },
      include: { user: { select: { name: true } } },
    });
    res.json({
      job,
      candidates: scans.map((s) => {
        const r = s.result as Record<string, any>;
        return {
          id: s.id,
          sessionId: s.sessionId,
          candidateName: s.candidateName || s.fileName,
          fileName: s.fileName,
          score: s.score,
          categories: r.categories,
          strengths: r.strengths,
          gaps: r.gaps,
          missing: r.keywords?.missing ?? [],
          insights: r.insights,
          screenedBy: s.user.name,
          createdAt: s.createdAt,
        };
      }),
    });
  }),
);

router.patch(
  '/jobs/:id',
  ah(async (req, res) => {
    await ownJob(req);
    const job = await prisma.job.update({ where: { id: req.params.id }, data: jobSchema.partial().parse(req.body) });
    res.json(job);
  }),
);

router.delete(
  '/jobs/:id',
  ah(async (req, res) => {
    await ownJob(req);
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

router.post(
  '/jobs/:id/screen',
  requireFeature('bulk'),
  ah(async (req, res) => {
    const job = await ownJob(req);
    const raw = req.files?.resumes;
    const files: UploadedFile[] = !raw ? [] : Array.isArray(raw) ? raw : [raw];
    if (!files.length) throw new HttpError(400, 'Attach at least one resume');
    if (files.length > 25) throw new HttpError(400, 'Up to 25 resumes per batch');

    const ent = await getEntitlement(req.user!);
    const limit = ent.limits.bulkPerMonth;
    if (limit !== null) {
      const used = await prisma.scan.count({ where: { orgId: orgId(req), bulk: true, createdAt: { gte: startOfMonth() } } });
      if (used + files.length > limit) {
        throw new HttpError(402, `This batch would exceed your ${limit} resumes/month limit (${used} used).`, 'UPGRADE_REQUIRED');
      }
    }

    // Small concurrency keeps us under LLM/embedding rate limits.
    const results: Array<{ fileName: string; ok: boolean; score?: number; error?: string }> = [];
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          if (!/\.(pdf|txt)$/i.test(f.name)) throw new Error('Only PDF or .txt files');
          const scan = await runScan({
            userId: req.user!.id,
            orgId: orgId(req),
            jobId: job.id,
            bulk: true,
            resume: f,
            jobDescriptionText: job.description,
          });
          results.push({ fileName: f.name, ok: true, score: scan.score });
        } catch (e: any) {
          results.push({ fileName: f.name, ok: false, error: e?.message || 'Failed' });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await audit(req.user!.id, 'org.bulk_screen', job.id, { count: files.length });
    res.json({ results });
  }),
);

router.get(
  '/jobs/:id/export.csv',
  requireFeature('export'),
  ah(async (req, res) => {
    const job = await ownJob(req);
    const scans = await prisma.scan.findMany({ where: { jobId: job.id }, orderBy: { score: 'desc' } });
    // Quote every cell, and defuse spreadsheet formulas: a file or candidate name like "=HYPERLINK(…)"
    // would otherwise run in Excel/Sheets. A leading apostrophe makes it plain text (OWASP CSV injection).
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['Rank', 'Candidate', 'File', 'Score', 'ATS', 'Impact', 'Keywords', 'Readability', 'Missing skills', 'Summary', 'Screened at'],
      ...scans.map((s, i) => {
        const r = s.result as Record<string, any>;
        return [
          i + 1,
          s.candidateName,
          s.fileName,
          s.score,
          r.categories?.ats,
          r.categories?.impact,
          r.categories?.keywords,
          r.categories?.readability,
          (r.keywords?.missing ?? []).join('; '),
          r.insights,
          s.createdAt.toISOString(),
        ];
      }),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${job.title.replace(/[^a-z0-9]+/gi, '-')}-candidates.csv"`);
    res.send(rows.map((r) => r.map(esc).join(',')).join('\n'));
  }),
);

export default router;
