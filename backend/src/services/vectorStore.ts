import { Pinecone } from '@pinecone-database/pinecone';
import { VectorMetadata, ResumeChunk } from '../types';
import { EmbeddingService } from './embeddingService';

export class VectorStore {
  private pinecone: Pinecone;
  private indexName: string;
  private embeddingService: EmbeddingService;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    this.indexName = process.env.PINECONE_INDEX_NAME || 'resume-screening';
    this.embeddingService = new EmbeddingService();
  }

  async storeChunks(
    sessionId: string,
    chunks: ResumeChunk[],
    type: 'resume' | 'jobDescription'
  ): Promise<void> {
    const index = this.pinecone.index(this.indexName);
    
    console.log(`  → Generating embeddings for ${chunks.length} ${type} chunks...`);
    // Generate embeddings for all chunks
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await this.embeddingService.generateBatchEmbeddings(texts);
    console.log(`  ✓ Generated ${embeddings.length} embeddings (${embeddings[0].length} dimensions)`);

    // Prepare vectors for upsert
    const vectors = chunks.map((chunk, i) => ({
      id: `${sessionId}:${type}:${chunk.index}`,
      values: embeddings[i],
      metadata: {
        sessionId,
        type,
        section: chunk.section,
        text: chunk.text,
        timestamp: new Date().toISOString(),
      },
    }));

    // Upsert in batches of 100
    console.log(`  → Storing ${vectors.length} vectors in Pinecone...`);
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }
    console.log(`  ✓ Stored ${vectors.length} vectors successfully`);
  }

  async searchSimilar(
    sessionId: string,
    query: string,
    topK: number = 3
  ): Promise<Array<{ text: string; section: string; score: number }>> {
    const index = this.pinecone.index(this.indexName);
    
    console.log(`  → Generating embedding for query...`);
    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    console.log(`  ✓ Query embedding generated (${queryEmbedding.length} dimensions)`);

    console.log(`  → Searching Pinecone for top ${topK} matches...`);
    // Search vectors
    const results = await index.query({
      vector: queryEmbedding,
      topK,
      filter: { sessionId },
      includeMetadata: true,
    });

    console.log(`  ✓ Found ${results.matches.length} matches`);
    results.matches.forEach((match, i) => {
      const metadata = match.metadata as VectorMetadata;
      console.log(`    ${i + 1}. [${metadata.section}] Score: ${(match.score || 0).toFixed(3)}`);
    });

    return results.matches.map(match => ({
      text: (match.metadata as VectorMetadata).text,
      section: (match.metadata as VectorMetadata).section,
      score: match.score || 0,
    }));
  }

  async getAllChunks(sessionId: string, type: 'resume' | 'jobDescription'): Promise<string[]> {
    const index = this.pinecone.index(this.indexName);
    
    // Fetch all vectors for this session and type
    const results = await index.query({
      vector: new Array(1536).fill(0), // Dummy vector
      topK: 100,
      filter: { sessionId, type },
      includeMetadata: true,
    });

    return results.matches.map(match => (match.metadata as VectorMetadata).text);
  }
}
