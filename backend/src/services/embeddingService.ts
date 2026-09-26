import { hf, HF_EMBEDDING_MODEL } from '../config/huggingface';

export class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await hf.featureExtraction({
        model: HF_EMBEDDING_MODEL,
        inputs: text,
        provider: 'hf-inference',
      });

      return result as number[];
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const result = await hf.featureExtraction({
        model: HF_EMBEDDING_MODEL,
        inputs: texts,
        provider: 'hf-inference',
      });

      return result as number[][];
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw new Error('Failed to generate batch embeddings');
    }
  }
}
