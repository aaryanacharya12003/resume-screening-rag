// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json) and handled
// by the compiled Express app from backend/ (built by `npm run build --prefix backend`).
module.exports = require('../backend/dist/app').default;
