import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const ax = e as AxiosError<{ error?: string }>;
  const apiError = ax?.response?.data?.error;
  if (apiError) return apiError;
  // No JSON error from our API: the server is down/restarting or the network dropped
  // (the dev proxy reports that as a bare 5xx).
  if (ax?.isAxiosError && (!ax.response || ax.response.status >= 500)) {
    return "Can't reach the Resumint server right now. Please try again in a moment.";
  }
  return (e as Error)?.message || fallback;
}

export const isUpgradeError = (e: unknown) =>
  (e as AxiosError<{ code?: string }>)?.response?.data?.code === 'UPGRADE_REQUIRED';

export type Role = 'USER' | 'ORG_ADMIN' | 'SUPER_ADMIN';

export interface PlanLimits {
  scansTotal: number | null;
  scansPerMonth: number | null;
  seats: number | null;
  bulkPerMonth: number | null;
  seatPriceInr?: number;
}

export interface Plan {
  id: string;
  code: 'free' | 'pro' | 'team' | 'enterprise';
  name: string;
  tagline: string;
  priceInr: number;
  yearlyPriceInr: number | null;
  interval: 'FREE' | 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  audience: string;
  highlight: boolean;
  limits: PlanLimits;
  features: string[];
  bullets: string[];
  sortOrder: number;
  active: boolean;
}

export interface Me {
  user: { id: string; email: string; name: string; role: Role; orgId: string | null; createdAt: string; emailVerified: boolean };
  org: null | { id: string; name: string; slug: string; seats: { total: number | null; used: number; pending: number } };
  plan: { code: Plan['code']; name: string; limits: PlanLimits; features: string[]; source: string; periodEnd: string | null };
  usage: { scansTotal: number; scansThisMonth: number; orgBulkThisMonth: number };
}

export interface ScanIssue { severity: 'high' | 'medium' | 'low'; title: string; detail: string; check: string }
export interface ScanResult {
  score: number;
  candidateName?: string;
  targetRole?: string;
  categories: { ats: number; impact: number; keywords: number; readability: number };
  strengths?: string[];
  gaps?: string[];
  issues?: ScanIssue[];
  keywords?: { have: string[]; missing: string[] };
  rewrites?: Array<{ before: string; after: string; why: string }>;
  insights?: string;
  hasJobDescription?: boolean;
  ragReady?: boolean;
  jobDescription?: string | null;
  counts?: { issues: number; rewrites: number; missingKeywords: number };
  resumeText?: string;
  optimized?: {
    fromScanId: string;
    fromScore: number;
    changes: string[];
    attempts: number;
    reachedTarget: boolean;
    improved?: boolean;
    blockers?: string[];
    confirmedSkills?: string[];
    /** How many bullet results the candidate supplied for this boost. */
    confirmedResults?: number;
  };
  /** Set when this version was created by editing another version and re-scoring it. */
  editedFrom?: { scanId: string; score: number };
}

export interface OptimizeJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  step: string;
  startedAt: number;
  resultScanId?: string;
  error?: string;
  blockers?: string[];
}
export interface Scan {
  id: string;
  sessionId: string;
  fileName: string;
  candidateName: string | null;
  score: number;
  jobId: string | null;
  createdAt: string;
  locked: boolean;
  result: ScanResult;
}

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const scoreClass = (n: number) => (n >= 75 ? 'score-hi' : n >= 50 ? 'score-mid' : 'score-lo');
