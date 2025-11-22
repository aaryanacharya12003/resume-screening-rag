import { Router } from 'express';
import { RAGService } from '../services/ragService';
import { ChatRequest, ChatResponse } from '../types';

const router = Router();
const ragService = new RAGService();

router.post('/', async (req, res) => {
  try {
    const { sessionId, question }: ChatRequest = req.body;

    console.log('\n💬 === NEW CHAT REQUEST ===');
    console.log(`🔑 Session: ${sessionId}`);
    console.log(`❓ Question: "${question}"`);

    if (!sessionId || !question) {
      console.log('❌ Missing sessionId or question');
      return res.status(400).json({ error: 'Session ID and question are required' });
    }

    // Use RAG to answer question
    console.log('🔍 Searching vectors in Pinecone...');
    const response: ChatResponse = await ragService.answerQuestion(sessionId, question);
    console.log(`✓ Answer generated (${response.answer.length} chars)`);
    console.log(`📚 Sources: ${response.sources.join(', ')}`);
    console.log('✅ Chat complete!\n');

    res.json(response);
  } catch (error) {
    console.error('\n❌ Chat error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

export default router;
