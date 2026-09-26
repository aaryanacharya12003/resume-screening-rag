# Resumint: AI resume checker & screening SaaS

Recruiter-grade resume analysis for job seekers, and AI bulk screening for hiring teams. Multi-tenant, with **User**, **Org Admin** and **Super Admin** panels, Razorpay billing, and a RAG engine (Pinecone + Hugging Face embeddings + Groq LLM).

## Plans

| Plan | Price | What you get |
|---|---|---|
| Free | ₹0 | 1 scan: score, category meters, top 3 issues |
| Pro | ₹99 one-time | Unlimited scans, full 30+ check report, JD matching, bullet rewrites, AI recruiter chat, version compare |
| Team | ₹2,999/mo or ₹29,990/yr | 5 recruiter seats (+₹499/seat), jobs, bulk screening (500 resumes/mo) with ranking, CSV export |
| Enterprise | Custom | Unlimited seats & volume, SSO, API, white-label, SLA (contact-sales form) |

Prices, limits and pricing-card copy live in the `Plan` table and are editable by the Super Admin (**Plans & pricing**). Limits are enforced server-side.

## Roles

- **User**: job seeker, or a recruiter seat inside an organization (inherits the org's plan).
- **Org Admin** (`/org`): team & invites, seats, jobs, bulk screening, CSV export, team billing.
- **Super Admin** (`/admin`): KPIs (MRR, revenue, scans, sign-ups), users, organizations, plan editor, payments & refunds, enterprise leads, audit log, complimentary plan grants.

## Stack

- **Backend**: Express + TypeScript, Prisma + PostgreSQL (Supabase), JWT in an httpOnly cookie, Razorpay orders + signature verification + webhook.
- **AI**: pdf-parse → section chunking → HF `bge-large-en-v1.5` embeddings → Pinecone (1024-d, cosine) for chat; Groq `gpt-oss-120b` for the scan report and RAG answers.
- **Frontend**: React 18 + Vite + React Router + TanStack Query + Recharts, styled with the Resumint theme (Fraunces / Plus Jakarta Sans / Kalam; navy, indigo, mint and raspberry with hard shadows). `resume test/` holds the original static design the layout started from.

## Run locally

```bash
cd backend && npm install && cp .env.example .env   # fill in keys
npx prisma migrate deploy && npx prisma db seed      # tables, 4 plans, super admin
npm run dev                                          # http://localhost:3001

cd ../frontend && npm install && npm run dev         # http://localhost:5173 (proxies /api)
```

- The super admin is created from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` by the seed.
- No Postgres handy? `npm run dev:db` starts a local PGlite Postgres on port 5433 (see `.env.example`).
- Without Razorpay keys, checkout runs in a simulated dev mode (never in production). With test keys, use Razorpay's test cards/UPI.
- Webhook (optional but recommended): point `https://<api>/api/billing/webhook` at `payment.captured`, `order.paid`, `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET`.

## Scoring

- **No job description:** the overall score is the average of the four categories (ATS, impact, keywords, readability), so it moves exactly when they do.
- **With a job description:** the overall score is the AI's "fit for this job" judgment; the categories are shown alongside.
- Scoring runs at temperature 0, so re-scoring the same text gives the same result.

## Resume optimizer ("Boost to 90+", Pro)

On any personal scan below 90, **Boost to 90+** edits the resume area by area, re-scores it (up to 4 passes) and saves the best version as a new scan with PDF / Word download, copy, edit & re-score, and compare.

- **No category may go down.** A version is saved only if ATS, Impact, Keywords and Readability are all at least the original's. Drafts are scored twice and averaged, because AI scores of identical text vary by a few points. Each pass edits one area and copies every other line. A working copy may dip for a pass (adding results lengthens bullets) and the next pass repairs that area.
- **Real results are the main lever.** The Boost card lists work bullets that state no outcome (`frontend/src/lib/resultGaps.ts`); the user types real results ("cut page load from 4s to 1.2s"), and only those numbers may be added. No placeholders are inserted.

- **Honesty guard** (`backend/src/lib/honesty.ts`): every draft is checked in code against the original. Any skill/tool, number, or new SKILLS item the original (plus what the user confirmed) doesn't contain gets one repair round, then the draft is discarded. The same guard turns invented numbers in the report's bullet suggestions into placeholders.
- **Missing skills are never added automatically.** The user can tick the ones they genuinely have (with a one-line detail); only those are added. Anything still missing is shown as the remaining path to 90+.
- Every version (optimized, edited or uploaded) can be downloaded as a **designed PDF** or an **editable Word (.docx)** file (`GET /api/scans/:id/export?format=pdf|docx`, Pro). `backend/src/lib/resumeStructure.ts` has the AI organize the text: it re-joins lines broken by PDF extraction, splits role/company/location/dates, and turns certifications, education and projects into separate entries. Code then rejects the result if it invented numbers or dropped more than 15% of the words, and falls back to the rule-based parser in `resumeFormat.ts`. The structure is cached on the scan per text hash. `resumeExport.ts` lays it out: one ATS-safe column, clickable email/phone/LinkedIn/GitHub links, bold titles with right-aligned dates, and real Word bullets. The PDF automatically tightens type and spacing to fit 2 pages. Unfilled `[placeholders]` are highlighted yellow in Word.
- **Edit & re-score** (`POST /api/scans/:id/rescore`) scores user-edited text as a new version against the same job description.
- **Groq key rotation** (`backend/src/config/groq.ts`): requests round-robin across `GROQ_API_KEY` plus comma-separated `GROQ_API_KEYS`. A rate-limited or rejected key is skipped (cooling down for as long as Groq asks) and the request moves to the next key.
- Runs as a background job (`POST /api/scans/:id/optimize` → poll `GET /api/scans/optimize-jobs/:jobId`), usually 2–3 minutes. Jobs are stored in the `OptimizeJob` table; on Vercel the work continues after the response via `waitUntil`.

## Email (password reset & team invites)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `backend/.env` (Gmail app password, Brevo, Resend, SES…). Until then, emails are printed to the backend log, and invite links can be copied from **Team & seats**.

- Reset links are single-use, expire in 1 hour, and are stored only as a SHA-256 hash. Resetting signs the user out of every other session.
- `/forgot-password` answers identically for unknown emails, and sends at most one email per minute per account.
- Invites are emailed on creation. **Resend** re-sends and extends the invite by 7 days.

## Database migrations

Use `npx prisma migrate deploy` against Supabase. Never pass the Supabase URL as `--shadow-database-url` to `prisma migrate diff` / `migrate dev`: Prisma **wipes** the shadow database.

## Deploy on Vercel

One Vercel project serves both halves: the React app as static files (`frontend/dist`) and the Express API as a serverless function (`api/index.js` → `backend/dist/app.js`). `vercel.json` holds the install/build commands, rewrites (`/api/*` → the function, everything else → the SPA) and a 300 s function limit for Boost.

1. Import the GitHub repo in Vercel (**Add New → Project**). Leave *Root Directory* as the repo root and *Framework Preset* as **Other**; `vercel.json` supplies the rest.
2. **Settings → Functions**: keep **Fluid Compute** on. It allows the 300 s `maxDuration` Boost needs (without it the Hobby plan caps functions at 60 s).
3. **Settings → Environment Variables** (Production), same names as `backend/.env.example`:
   - `DATABASE_URL`: use Supabase's **pooled** connection string (port 6543) with `?pgbouncer=true&connection_limit=1`, since serverless opens many short connections.
   - `JWT_SECRET` (a new long random value), `GROQ_API_KEY` / `GROQ_API_KEYS`, `HF_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
   - `FRONTEND_URL=https://<your-project>.vercel.app` (used in email links and CORS), `TRUST_PROXY=1`, `NODE_ENV=production`
   - Leave `VITE_API_URL` unset: the app calls `/api` on the same domain.
4. Deploy. Migrations are not run by the build; apply new ones from your machine with `npm run db:deploy --prefix backend`.
5. In Razorpay add the webhook `https://<your-domain>/api/billing/webhook` (events `payment.captured`, `order.paid`, `payment.failed`).

Limits on Vercel: request bodies are capped at 4.5 MB, so uploads are limited to 4 MB per file and bulk screening sends resumes in batches of 3. Rate limits are counted per function instance.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register · login · logout`, `GET /api/auth/me`, `GET/POST /api/auth/invite/:token[/accept]` |
| Scans | `POST /api/scans` (multipart `resume`, optional `jobDescriptionText`), `GET /api/scans[/:id]`, `DELETE /api/scans/:id`, `POST /api/chat` |
| Billing | `GET /api/billing/plans`, `POST /api/billing/checkout · verify · contact-sales`, `GET /api/billing/history`, `POST /api/billing/webhook` |
| Org admin | `/api/org` overview, `/members`, `/invites`, `/jobs`, `POST /jobs/:id/screen` (multipart `resumes[]`), `GET /jobs/:id/export.csv` |
| Super admin | `/api/admin/stats · users · orgs · plans · payments · leads · audit`, grants and refunds |

Sample resumes and job descriptions are in `sample-data/`.
