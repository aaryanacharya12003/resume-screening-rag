export interface UploadResponse {
  sessionId: string;
  matchScore: number;
  strengths: string[];
  gaps: string[];
  insights: string;
}

export interface ChatRequest {
  sessionId: string;
  question: string;
}

export interface ChatResponse {
  answer: string;
  sources: string[];
}

export interface ResumeChunk {
  text: string;
  section: string;
  index: number;
}

export interface VectorMetadata {
  sessionId: string;
  type: 'resume' | 'jobDescription';
  section: string;
  text: string;
  timestamp: string;
  [key: string]: string; // Index signature for Pinecone compatibility
}

export interface ScanIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  check: string;
}

export interface MatchAnalysis {
  score: number;
  candidateName: string;
  targetRole: string;
  categories: { ats: number; impact: number; keywords: number; readability: number };
  strengths: string[];
  gaps: string[];
  issues: ScanIssue[];
  keywords: { have: string[]; missing: string[] };
  rewrites: Array<{ before: string; after: string; why: string }>;
  insights: string;
  hasJobDescription: boolean;
}
