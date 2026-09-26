import crypto from 'crypto';
import { prisma } from '../config/db';
import { MatchAnalysis } from '../types';
import { PDFParser } from './pdfParser';
import { VectorStore } from './vectorStore';
import { MatchingService } from './matchingService';

const pdfParser = new PDFParser();
const vectorStore = new VectorStore();
const matchingService = new MatchingService();

// Kept on the scan so the optimizer can rewrite it later; long enough for any real resume.
const MAX_STORED_RESUME = 20000;

export interface RunScanInput {
  userId: string;
  orgId: string | null;
  jobId?: string | null;
  bulk?: boolean;
  /** Either an uploaded file or already-extracted text (optimizer output). */
  resume: { name: string; data?: Buffer; text?: string };
  jobDescriptionText?: string;
  /** Skip the LLM call when the caller already scored this exact text. */
  analysis?: MatchAnalysis;
  extraResult?: Record<string, unknown>;
}

/** The model's report inside a stored scan result, without our bookkeeping fields. */
function analysisFrom(result: unknown): MatchAnalysis | undefined {
  const r = result as Record<string, any> | null;
  if (!r?.categories || typeof r.score !== 'number') return undefined;
  const { ragReady, jobDescription, resumeText, fingerprint, optimized, editedFrom, structured, ...analysis } = r;
  return analysis as MatchAnalysis;
}

/** Parse → embed into Pinecone (for RAG chat) → LLM report → persist. */
export async function runScan(input: RunScanInput) {
  const sessionId = crypto.randomUUID();
  const resumeText = (
    input.resume.text ?? (await pdfParser.extractText(input.resume.data ?? Buffer.alloc(0), input.resume.name))
  ).trim();
  if (resumeText.length < 100) {
    throw Object.assign(new Error('Could not read enough text from this file. Try a text-based PDF or .txt.'), { status: 422 });
  }
  const jdText = input.jobDescriptionText?.trim() || undefined;

  // Vectors power the chat; a vector-store outage should not block the report itself.
  const indexing = Promise.all([
    vectorStore.storeChunks(sessionId, pdfParser.chunkText(resumeText, 'resume'), 'resume'),
    jdText ? vectorStore.storeChunks(sessionId, pdfParser.chunkText(jdText, 'jobDescription'), 'jobDescription') : null,
  ])
    .then(() => true)
    .catch((e) => {
      console.error('Vector indexing failed:', e?.message || e);
      return false;
    });

  // Same resume text + same job description → same report. Re-uploading an identical resume reuses
  // the earlier analysis instead of asking the model again (which could differ by a point or two).
  const fingerprint = crypto.createHash('sha256').update(`${resumeText}\n--JD--\n${jdText ?? ''}`).digest('hex');
  const previous = input.analysis
    ? null
    : await prisma.scan.findFirst({
        where: { userId: input.userId, result: { path: ['fingerprint'], equals: fingerprint } },
        orderBy: { createdAt: 'desc' },
      });
  const reused = previous ? analysisFrom(previous.result) : undefined;
  if (reused) console.log(`  ↺ identical resume already scored (${previous!.id.slice(0, 8)}); reusing its analysis`);

  const [analysis, ragReady] = await Promise.all([
    input.analysis ?? reused ?? matchingService.analyzeMatch(resumeText, jdText),
    indexing,
  ]);

  return prisma.scan.create({
    data: {
      sessionId,
      userId: input.userId,
      orgId: input.orgId,
      jobId: input.jobId ?? null,
      bulk: input.bulk ?? false,
      fileName: input.resume.name,
      candidateName: analysis.candidateName || null,
      score: analysis.score,
      result: {
        ...analysis,
        ragReady,
        jobDescription: jdText?.slice(0, 4000) ?? null,
        resumeText: resumeText.slice(0, MAX_STORED_RESUME),
        fingerprint,
        ...input.extraResult,
      } as object,
    },
  });
}

/** Resume text for a scan: stored on newer scans, rebuilt from Pinecone chunks for older ones. */
export async function getResumeText(scan: { sessionId: string; result: unknown }) {
  const stored = (scan.result as Record<string, unknown>)?.resumeText;
  if (typeof stored === 'string' && stored.length > 100) return stored;
  const chunks = await vectorStore.getAllChunks(scan.sessionId, 'resume').catch(() => []);
  return chunks.join('\n\n');
}
