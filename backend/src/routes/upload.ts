import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PDFParser } from '../services/pdfParser';
import { VectorStore } from '../services/vectorStore';
import { MatchingService } from '../services/matchingService';
import { UploadResponse } from '../types';

const router = Router();
const pdfParser = new PDFParser();
const vectorStore = new VectorStore();
const matchingService = new MatchingService();

router.post('/', async (req, res) => {
  try {
    console.log('\n📤 === NEW UPLOAD REQUEST ===');
    
    if (!req.files || !req.files.resume || !req.files.jobDescription) {
      console.log('❌ Missing files');
      return res.status(400).json({ error: 'Both resume and job description are required' });
    }

    const resumeFile = Array.isArray(req.files.resume) ? req.files.resume[0] : req.files.resume;
    const jdFile = Array.isArray(req.files.jobDescription) 
      ? req.files.jobDescription[0] 
      : req.files.jobDescription;

    console.log(`📄 Resume: ${resumeFile.name} (${(resumeFile.size / 1024).toFixed(2)} KB)`);
    console.log(`📋 Job Description: ${jdFile.name} (${(jdFile.size / 1024).toFixed(2)} KB)`);

    // Generate session ID
    const sessionId = uuidv4();
    console.log(`🔑 Session ID: ${sessionId}`);

    // Extract text from files (PDF or TXT)
    console.log('\n📖 Extracting text from files...');
    const resumeText = await pdfParser.extractText(resumeFile.data, resumeFile.name);
    const jdText = await pdfParser.extractText(jdFile.data, jdFile.name);
    console.log(`✓ Resume text: ${resumeText.length} characters`);
    console.log(`✓ Job description text: ${jdText.length} characters`);

    // Chunk documents
    console.log('\n✂️  Chunking documents...');
    const resumeChunks = pdfParser.chunkText(resumeText, 'resume');
    const jdChunks = pdfParser.chunkText(jdText, 'jobDescription');
    console.log(`✓ Resume chunks: ${resumeChunks.length}`);
    console.log(`✓ Job description chunks: ${jdChunks.length}`);

    // Store in vector database (RAG implementation)
    console.log('\n🔮 Generating embeddings and storing in Pinecone...');
    await Promise.all([
      vectorStore.storeChunks(sessionId, resumeChunks, 'resume'),
      vectorStore.storeChunks(sessionId, jdChunks, 'jobDescription'),
    ]);
    console.log(`✓ Stored ${resumeChunks.length + jdChunks.length} vectors in Pinecone`);

    // Analyze match
    console.log('\n🤖 Analyzing match with AI...');
    const analysis = await matchingService.analyzeMatch(resumeText, jdText);
    console.log(`✓ Match score: ${analysis.score}%`);

    const response: UploadResponse = {
      sessionId,
      matchScore: analysis.score,
      strengths: analysis.strengths,
      gaps: analysis.gaps,
      insights: analysis.insights,
    };

    console.log('\n✅ Upload complete!\n');
    res.json(response);
  } catch (error) {
    console.error('\n❌ Upload error:', error);
    res.status(500).json({ error: 'Failed to process files' });
  }
});

export default router;
