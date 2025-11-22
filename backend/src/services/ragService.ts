import { openai, CHAT_MODEL } from '../config/openai';
import { VectorStore } from './vectorStore';
import { ChatResponse } from '../types';

export class RAGService {
  private vectorStore: VectorStore;

  constructor() {
    this.vectorStore = new VectorStore();
  }

  async answerQuestion(sessionId: string, question: string): Promise<ChatResponse> {
    // Step 1: Retrieve relevant context from vector store
    const relevantChunks = await this.vectorStore.searchSimilar(sessionId, question, 4); // Get 4 chunks for better context

    if (relevantChunks.length === 0) {
      return {
        answer: "I don't have enough information to answer that question based on the resume provided.",
        sources: [],
      };
    }

    // Step 2: Build context from retrieved chunks
    const context = relevantChunks
      .map((chunk, i) => `[Source ${i + 1} - ${chunk.section}]:\n${chunk.text}`)
      .join('\n\n');

    // Step 3: Generate answer using LLM with augmented context
    const prompt = `You are an expert recruiter assistant analyzing a candidate's resume. Your job is to answer questions accurately based ONLY on the information provided in the resume context below.

CRITICAL RULES:
1. If the question asks "Does/Do/Can/Has/Is", start with "Yes" or "No" clearly
2. After Yes/No, provide specific evidence from the resume
3. If information is NOT in the resume, say "The resume does not mention..."
4. Be precise - cite specific years, technologies, companies, or achievements
5. Do not make assumptions or infer information not explicitly stated
6. IMPORTANT: Distinguish between different types of roles and leadership:
   - DevOps/Cloud Engineer ≠ Backend Developer
   - Leading DevOps team ≠ Leading Backend Development team
   - Infrastructure experience ≠ Application development experience
7. If the question asks about a specific role capability, consider if their experience directly matches that role

RESUME CONTEXT:
${context}

QUESTION: ${question}

Provide a clear, accurate answer based on the resume context above:`;

    try {
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // Lower temperature for more accurate responses
        max_tokens: 300, // Increase for complete answers
      });

      const answer = response.choices[0].message.content || 'Unable to generate answer.';
      const sources = relevantChunks.map(chunk => chunk.section);

      return {
        answer,
        sources: [...new Set(sources)], // Remove duplicates
      };
    } catch (error) {
      console.error('Error generating answer:', error);
      throw new Error('Failed to generate answer');
    }
  }
}
