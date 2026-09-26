import { Router } from 'express';
import { z } from 'zod';
import { RAGService } from '../services/ragService';
import { requireAuth, requireFeature } from '../middleware/auth';
import { ah } from '../lib/http';
import { findAccessibleScan } from './scans';

const router = Router();
const ragService = new RAGService();

router.post(
  '/',
  requireAuth,
  requireFeature('chat'),
  ah(async (req, res) => {
    const { sessionId, question } = z
      .object({ sessionId: z.string().min(1), question: z.string().trim().min(2).max(500) })
      .parse(req.body);
    // Only lets users query vectors of scans they own (or their org's, for org admins).
    const scan = await findAccessibleScan(sessionId, req.user!);
    res.json(await ragService.answerQuestion(scan.sessionId, question));
  }),
);

export default router;
