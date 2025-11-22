import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import dotenv from 'dotenv';
import uploadRouter from './routes/upload';
import chatRouter from './routes/chat';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  abortOnLimit: true,
}));

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
