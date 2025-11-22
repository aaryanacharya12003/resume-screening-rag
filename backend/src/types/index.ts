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

export interface MatchAnalysis {
  score: number;
  strengths: string[];
  gaps: string[];
  insights: string;
}
