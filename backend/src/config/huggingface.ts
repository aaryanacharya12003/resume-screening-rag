import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';

dotenv.config();

export const hf = new HfInference(process.env.HF_API_KEY);

// bge-large-en-v1.5 outputs 1024-dim vectors, matching the Pinecone index
export const HF_EMBEDDING_MODEL = 'BAAI/bge-large-en-v1.5';
export const EMBEDDING_DIMENSIONS = 1024;
