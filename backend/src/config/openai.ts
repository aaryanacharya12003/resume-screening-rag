import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1024; // Match Pinecone index
export const CHAT_MODEL = 'openai/gpt-4';
