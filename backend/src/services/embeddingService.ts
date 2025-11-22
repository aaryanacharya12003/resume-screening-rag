import { openai, EMBEDDING_MODEL } from '../config/openai';

export class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: 1024, // Match Pinecone index
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: 1024, // Match Pinecone index
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw new Error('Failed to generate batch embeddings');
    }
  }
}
