import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

export interface UploadResponse {
  sessionId: string;
  matchScore: number;
  strengths: string[];
  gaps: string[];
  insights: string;
}

export interface ChatResponse {
  answer: string;
  sources: string[];
}

export const uploadFiles = async (
  resume: File,
  jobDescription: File
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('resume', resume);
  formData.append('jobDescription', jobDescription);

  const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const askQuestion = async (
  sessionId: string,
  question: string
): Promise<ChatResponse> => {
  const response = await axios.post(`${API_BASE_URL}/chat`, {
    sessionId,
    question,
  });

  return response.data;
};
