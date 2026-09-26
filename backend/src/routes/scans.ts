import crypto from 'crypto';
import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { UploadedFile } from 'express-fileupload';
import { Scan } from '@prisma/client';
import { prisma } from '../config/db';
import { requireAuth } from '../middleware/auth';
import { getEntitlement, getUsage } from '../lib/entitlements';
import { ah, HttpError } from '../lib/http';
import { PDFParser } from '../services/pdfParser';
import { getResumeText, runScan } from '../services/scanService';
import { createJob, getJob, optimizeResume, runningJobFor, TARGET_SCORE, updateJob } from '../services/optimizerService';
import { MatchAnalysis } from '../types';
import { audit } from '../lib/audit';
import { resumeToDocx, resumeToPdf } from '../lib/resumeExport';
import { structureResume, StructuredResume, textHash } from '../lib/resumeStructure';

const router = Router();
const pdfParser = new PDFParser();
router.use(requireAuth);

const ALLOWED = /\.(pdf|txt)$/i;

export const oneFile = (f: UploadedFile | UploadedFile[] | undefined) => (Array.isArray(f) ? f[0] : f);

/** Free plans see the score and top-3 issues only; the rest is redacted server-side. */
export function shapeScan(scan: Scan, full: boolean) {
  const result = scan.result as Record<string, any>;
  const base = {
    id: scan.id,
    sessionId: scan.sessionId,
    fileName: scan.fileName,
    candidateName: scan.candidateName,
    score: scan.score,
    jobId: scan.jobId,
    createdAt: scan.createdAt,
  };
  if (full) return { ...base, result, locked: false };
  return {
    ...base,
    locked: true,
    result: {
      score: result.score,
      targetRole: result.targetRole,
      categories: result.categories,
      issues: (result.issues || []).slice(0, 3),
      strengths: (result.strengths || []).slice(0, 1),
      insights: result.insights,
      hasJobDescription: result.hasJobDescription,
      counts: {
        issues: (result.issues || []).length,
        rewrites: (result.rewrites || []).length,
        missingKeywords: (result.keywords?.missing || []).length,
      },
    },
  };
}

/**
 * What the scan list needs (dashboard table, compare picker). Omits the resume text, the
 * structured resume, the job description and rewrites, which only the detail page uses.
 */
function summarizeScan(scan: Scan, full: boolean) {
  const shaped = shapeScan(scan, full);
  const r = shaped.result as Record<string, any>;
  const issues: any[] = r.issues || [];
  return {
    ...shaped,
    result: {
      score: r.score,
      targetRole: r.targetRole,
      categories: r.categories,
      hasJobDescription: r.hasJobDescription,
      issues: issues.map(({ title, detail, check, severity }) => ({ title, detail, check, severity })),
      keywords: full ? { have: r.keywords?.have || [] } : undefined,
      optimized: r.optimized ? { fromScanId: r.optimized.fromScanId, fromScore: r.optimized.fromScore } : undefined,
      editedFrom: r.editedFrom,
      counts: r.counts,
    },
  };
}

router.post(
  '/',
  ah(async (req, res) => {
    const user = req.user!;
    const ent = await getEntitlement(user);
    const usage = await getUsage(user);
    if (ent.limits.scansTotal !== null && usage.scansTotal >= ent.limits.scansTotal) {
      throw new HttpError(402, `You've used your free scan. Upgrade to Pro for unlimited scans.`, 'UPGRADE_REQUIRED');
    }
    if (ent.limits.scansPerMonth !== null && usage.scansThisMonth >= ent.limits.scansPerMonth) {
      throw new HttpError(402, 'Monthly scan limit reached for your plan.', 'UPGRADE_REQUIRED');
    }

    const resume = oneFile(req.files?.resume);
    if (!resume) throw new HttpError(400, 'Please attach a resume');
    if (!ALLOWED.test(resume.name)) throw new HttpError(400, 'Resume must be a PDF or .txt file');
    // Vercel caps request bodies at 4.5 MB.
    if (resume.size > 4 * 1024 * 1024) throw new HttpError(400, 'Resume must be under 4 MB');

    let jdText: string | undefined = typeof req.body.jobDescriptionText === 'string' ? req.body.jobDescriptionText : undefined;
    const jdFile = oneFile(req.files?.jobDescription);
    if (jdFile) jdText = await pdfParser.extractText(jdFile.data, jdFile.name);
    if (jdText?.trim() && !ent.features.includes('jdMatch')) {
      throw new HttpError(402, 'Job-description matching is a Pro feature.', 'UPGRADE_REQUIRED');
    }

    const scan = await runScan({ userId: user.id, orgId: user.orgId, resume, jobDescriptionText: jdText });
    res.status(201).json(shapeScan(scan, ent.features.includes('fullReport')));
  }),
);

router.get(
  '/',
  ah(async (req, res) => {
    const ent = await getEntitlement(req.user!);
    const scans = await prisma.scan.findMany({
      where: { userId: req.user!.id, bulk: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(scans.map((s) => summarizeScan(s, ent.features.includes('fullReport'))));
  }),
);

/** Owner, or an org admin of the org the scan belongs to. */
export async function findAccessibleScan(id: string, user: { id: string; orgId: string | null; role: string }) {
  const scan = await prisma.scan.findFirst({ where: { OR: [{ id }, { sessionId: id }] } });
  if (!scan) throw new HttpError(404, 'Scan not found');
  const own = scan.userId === user.id;
  const orgAdmin = user.role === 'ORG_ADMIN' && !!user.orgId && scan.orgId === user.orgId;
  if (!own && !orgAdmin && user.role !== 'SUPER_ADMIN') throw new HttpError(404, 'Scan not found');
  return scan;
}

router.get(
  '/:id',
  ah(async (req, res) => {
    const scan = await findAccessibleScan(req.params.id, req.user!);
    const ent = await getEntitlement(req.user!);
    res.json(shapeScan(scan, ent.features.includes('fullReport')));
  }),
);

/** Rewrites the resume toward a 90+ score (TARGET_SCORE) and saves the result as a new version. */
router.post(
  '/:id/optimize',
  ah(async (req, res) => {
    const user = req.user!;
    const scan = await findAccessibleScan(req.params.id, user);
    if (scan.userId !== user.id || scan.bulk) throw new HttpError(403, 'You can only optimize your own resumes');
    const ent = await getEntitlement(user);
    if (!ent.features.includes('rewrites')) {
      throw new HttpError(402, 'The 90+ optimizer is a Pro feature. Upgrade to unlock it.', 'UPGRADE_REQUIRED');
    }
    const result = scan.result as unknown as MatchAnalysis & { jobDescription?: string | null };
    if (scan.score >= TARGET_SCORE) throw new HttpError(400, `This resume already scores ${scan.score}. Nothing left to boost!`);

    const existing = await runningJobFor(user.id, scan.id);
    if (existing) return res.status(202).json(existing);

    const resumeText = await getResumeText(scan);
    if (resumeText.length < 100) throw new HttpError(422, 'Could not load the text of this resume. Please re-upload it.');
    const jd = result.jobDescription || undefined;
    const { confirmedSkills, confirmedResults: rawResults } = z
      .object({
        confirmedSkills: z
          .array(z.object({ skill: z.string().trim().min(1).max(80), detail: z.string().trim().max(300).optional() }))
          .max(15)
          .default([]),
        confirmedResults: z
          .array(z.object({ bullet: z.string().trim().min(10).max(600), result: z.string().trim().min(2).max(200) }))
          .max(12)
          .default([]),
      })
      .parse(req.body ?? {});
    // A result must belong to a bullet that is really in this resume.
    const lineKey = (l: string) => l.replace(/^[\s\-–•*▪‣●◦·]+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const lines = new Set(resumeText.split('\n').map(lineKey));
    const confirmedResults = rawResults.filter((r) => lines.has(lineKey(r.bullet)));

    // Takes 1-3 minutes (several LLM calls), so it runs in the background and the client polls.
    const job = await createJob({ id: crypto.randomUUID(), userId: user.id, scanId: scan.id });
    // Progress steps are written to the job row (throttled: the same step is never written twice).
    let lastStep = job.step;
    const setStep = (step: string) => {
      if (step === lastStep) return;
      lastStep = step;
      void updateJob(job.id, { step });
    };
    // Runs after the response. On Vercel, waitUntil keeps the function alive until it finishes
    // (up to the function's maxDuration); on a normal server it is a no-op.
    const work = (async () => {
      try {
        const out = await optimizeResume(resumeText, jd, result, setStep, confirmedSkills, confirmedResults);
        await updateJob(job.id, { blockers: out.blockers });
        const hadInput = confirmedSkills.length > 0 || confirmedResults.length > 0;
        if (!out.hasDraft && !hadInput) {
          throw new Error(
            "Rewording alone couldn't raise your score without lowering another area, so we kept your original. Add a real result to at least one of the bullets listed above (or tick a skill you have) and Boost again.",
          );
        }
        if (!out.hasDraft && out.regressed.length) {
          throw new Error(
            `Every version we tried lowered your ${out.regressed.join(' and ')} score, so we kept your original. Add results to more of the bullets listed above, then Boost again.`,
          );
        }
        if (!out.hasDraft) {
          throw new Error(
            "We couldn't produce an honest rewrite this time. Add real results to the bullets listed above, or tick skills you have, and try again.",
          );
        }
        setStep('Saving your new version');
        const base = baseName(scan.fileName);
        const created = await runScan({
          userId: user.id,
          orgId: user.orgId,
          resume: { name: `${base}-optimized.txt`, text: out.resumeText },
          jobDescriptionText: jd,
          analysis: out.analysis,
          extraResult: {
            optimized: {
              fromScanId: scan.id,
              fromScore: scan.score,
              changes: out.changes,
              attempts: out.attempts,
              reachedTarget: out.reachedTarget,
              improved: out.improved,
              blockers: out.blockers,
              confirmedSkills: confirmedSkills.map((c) => c.skill),
              confirmedResults: confirmedResults.length,
            },
          },
        });
        await audit(user.id, 'scan.optimize', created.id, { from: scan.score, to: created.score });
        await updateJob(job.id, { status: 'done', resultScanId: created.id });
      } catch (e: any) {
        console.error('Optimize failed:', e?.message || e);
        // Provider errors ("400 Failed to generate JSON…") are logged above but never shown to users.
        const msg: string = e?.message || '';
        const technical = !msg || /^\d{3}\b|json|generation|timeout|ECONN/i.test(msg);
        await updateJob(job.id, { status: 'failed', error: technical ? 'Something went wrong while optimizing. Please try Boost again.' : msg });
      }
    })();
    waitUntil(work);
    res.status(202).json(job);
  }),
);

router.get(
  '/optimize-jobs/:jobId',
  ah(async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.userId !== req.user!.id) throw new HttpError(404, 'Optimization not found (it may have expired)');
    res.json(job);
  }),
);

/** Formatted download of a version: a designed one-column PDF or an editable Word document. */
router.get(
  '/:id/export',
  ah(async (req, res) => {
    const format = String(req.query.format);
    if (format !== 'pdf' && format !== 'docx') throw new HttpError(400, 'format must be pdf or docx');
    const scan = await findAccessibleScan(req.params.id, req.user!);
    const ent = await getEntitlement(req.user!);
    if (!ent.features.includes('fullReport')) {
      throw new HttpError(402, 'Formatted PDF and Word downloads are a Pro feature.', 'UPGRADE_REQUIRED');
    }
    const text = await getResumeText(scan);
    if (text.length < 100) throw new HttpError(422, 'This scan has no saved resume text to export. Re-upload the resume.');

    // AI structuring costs an LLM call, so it's cached on the scan and reused until the text changes.
    const result = scan.result as Record<string, any>;
    const hash = textHash(text);
    let structured: StructuredResume = result.structured?.hash === hash ? result.structured.data : undefined;
    if (!structured) {
      const out = await structureResume(text);
      structured = out.data;
      await prisma.scan.update({
        where: { id: scan.id },
        data: { result: { ...result, structured: { hash, source: out.source, data: out.data } } as object },
      });
    }

    const file = format === 'pdf' ? await resumeToPdf(structured) : await resumeToDocx(structured);
    const name = `${(scan.candidateName || baseName(scan.fileName)).replace(/[^\w.-]+/g, '-').replace(/-+/g, '-')}-resume.${format}`;
    res.setHeader(
      'Content-Type',
      format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(file);
  }),
);

/** "resume-optimized-edited.txt" → "resume": versions share one readable base name. */
const baseName = (fileName: string) => fileName.replace(/\.(pdf|txt)$/i, '').replace(/(-(optimized|edited))+$/, '');

/**
 * Scores text the user edited in the browser (e.g. placeholders filled in) as a new version,
 * against the same job description as the scan it came from.
 */
router.post(
  '/:id/rescore',
  ah(async (req, res) => {
    const user = req.user!;
    const scan = await findAccessibleScan(req.params.id, user);
    if (scan.userId !== user.id || scan.bulk) throw new HttpError(403, 'You can only re-score your own resumes');
    const ent = await getEntitlement(user);
    if (!ent.features.includes('fullReport')) {
      throw new HttpError(402, 'Editing and re-scoring versions is a Pro feature.', 'UPGRADE_REQUIRED');
    }
    const { text } = z
      .object({ text: z.string().trim().min(200, 'The resume looks too short to score.').max(20000, 'The resume is too long (20,000 characters max).') })
      .parse(req.body);
    const result = scan.result as Record<string, any>;
    const created = await runScan({
      userId: user.id,
      orgId: user.orgId,
      resume: { name: `${baseName(scan.fileName)}-edited.txt`, text },
      jobDescriptionText: result.jobDescription || undefined,
      extraResult: { editedFrom: { scanId: scan.id, score: scan.score } },
    });
    await audit(user.id, 'scan.rescore', created.id, { from: scan.score, to: created.score });
    res.status(201).json(shapeScan(created, true));
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const scan = await findAccessibleScan(req.params.id, req.user!);
    await prisma.scan.delete({ where: { id: scan.id } });
    res.json({ ok: true });
  }),
);

export default router;
