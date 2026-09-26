import app from './app';
import { markInterruptedJobs } from './services/optimizerService';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  // Boost jobs that were running when the previous process stopped can't resume; tell their users.
  // (Not done on Vercel: there, many short-lived instances start while other instances are mid-job.)
  markInterruptedJobs().catch((e) => console.error('Could not update interrupted jobs:', e?.message || e));
});
