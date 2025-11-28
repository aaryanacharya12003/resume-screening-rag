# 🤖 AI-Powered Resume Screening Tool

> A production-ready RAG (Retrieval-Augmented Generation) system for intelligent resume analysis and candidate Q&A

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)](https://openai.com/)
[![Pinecone](https://img.shields.io/badge/Pinecone-000000?style=flat&logo=pinecone&logoColor=white)](https://www.pinecone.io/)

## � Tablre of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [RAG Architecture](#rag-architecture)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

## 🎯 Overview

This application revolutionizes the resume screening process by combining AI-powered analysis with semantic search capabilities. Built with a true RAG architecture, it provides accurate, context-aware insights about candidates by intelligently retrieving relevant information from resumes and generating precise answers.

### Why RAG?

Traditional approaches send entire resumes to LLMs, which is:
- ❌ Expensive (high token usage)
- ❌ Slow (processing large documents)
- ❌ Less accurate (information gets lost in context)

Our RAG approach:
- ✅ Cost-effective (only relevant chunks processed)
- ✅ Fast (semantic search in milliseconds)
- ✅ Accurate (focused context for each question)
- ✅ Scalable (handles thousands of resumes)

## ✨ Features

### 📤 Smart Document Upload
- Support for PDF and TXT formats
- Automatic text extraction and parsing
- Intelligent document chunking by sections
- Real-time processing feedback

### 🎯 AI-Powered Match Analysis
- **Match Score (0-100%)**: Accurate scoring based on job requirements
- **Strengths Identification**: Highlights candidate's best qualifications
- **Gap Analysis**: Identifies missing skills or experience
- **Key Insights**: AI-generated summary of candidate fit

### 💬 RAG-Powered Chat Interface
- Ask natural language questions about candidates
- Context-aware responses with source attribution
- Semantic search retrieves relevant resume sections
- Distinguishes between different role types (DevOps vs Backend, etc.)

### 🎨 Professional UI
- Modern, responsive design
- Real-time loading states
- Gradient animations and smooth transitions
- Mobile-friendly interface

## 🛠️ Tech Stack

### Backend
| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime environment | 18+ |
| **TypeScript** | Type safety | 5.x |
| **Express.js** | Web framework | 4.x |
| **OpenAI API** | Embeddings & LLM | Latest |
| **Pinecone** | Vector database | 2.x |
| **pdf-parse** | PDF extraction | 1.x |

### Frontend
| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 18.x |
| **TypeScript** | Type safety | 5.x |
| **Vite** | Build tool | 5.x |
| **Tailwind CSS** | Styling | 3.x |
| **Axios** | HTTP client | 1.x |

## 🏗️ RAG Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     UPLOAD FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Resume PDF/TXT                                             │
│       ↓                                                     │
│  Extract Text (pdf-parse)                                   │
│       ↓                                                     │
│  Chunk by Sections (Experience, Education, Skills, etc.)    │
│       ↓                                                     │
│  Generate Embeddings (OpenAI text-embedding-3-small)        │
│       ↓                                                     │
│  Store Vectors in Pinecone (1024 dimensions)                │
│       ↓                                                     │
│  Analyze Match with LLM (GPT-3.5-turbo)                     │
│       ↓                                                     │
│  Return Score, Strengths, Gaps, Insights                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     CHAT FLOW (RAG)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User Question: "Does candidate have React experience?"     │
│       ↓                                                     │
│  Generate Question Embedding                                │
│       ↓                                                     │
│  Semantic Search in Pinecone (cosine similarity)            │
│       ↓                                                     │
│  Retrieve Top 4 Relevant Chunks                             │
│       ↓                                                     │
│  Build Augmented Prompt: [Context] + [Question]             │
│       ↓                                                     │
│  LLM Generates Answer (GPT-3.5-turbo)                       │
│       ↓                                                     │
│  Return Answer + Sources                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Document Processing**: Extracts text and chunks into semantic sections
2. **Embedding Generation**: Converts text to 1024-dimensional vectors
3. **Vector Storage**: Stores embeddings in Pinecone with metadata
4. **Semantic Search**: Finds relevant chunks using cosine similarity
5. **Context Augmentation**: Combines retrieved chunks with user question
6. **Answer Generation**: LLM generates accurate, context-aware responses

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- OpenAI API key (OpenRouter)
- Pinecone account (free tier available)

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/resume-screening-rag.git
cd resume-screening-rag
```

### 2. Setup Pinecone

1. Sign up at [pinecone.io](https://www.pinecone.io/)
2. Create a new index:
   - **Name**: `resume-screening`
   - **Dimensions**: `1024`
   - **Metric**: `cosine`
   - **Cloud**: AWS
   - **Region**: `us-east-1`

### 3. Configure Backend

```bash
cd backend
npm install
```

Create `.env` file:
```env
# OpenAI Configuration (OpenRouter)
OPENAI_API_KEY=your-openrouter-api-key

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=resume-screening

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

Start backend:
```bash
npm run dev
```

Backend will run on: **http://localhost:3001**

### 4. Setup Frontend

Open new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on: **http://localhost:5173**

### 5. Test the Application

1. Open http://localhost:5173 in your browser
2. Upload sample files from `sample-data/` folder:
   - Resume: `resume1.txt`
   - Job Description: `job-description.txt`
3. Click "Analyze Resume"
4. View match analysis
5. Ask questions in the chat!

## 📖 Usage

### Uploading Documents

1. Click "Choose File" for Resume
2. Select a PDF or TXT file (max 10MB)
3. Click "Choose File" for Job Description
4. Select a PDF or TXT file
5. Click "Analyze Resume"
6. Wait 5-10 seconds for processing

### Viewing Match Analysis

The system displays:
- **Match Score**: 0-100% based on job requirements
- **Strengths**: Top qualifications that match the role
- **Gaps**: Missing skills or experience
- **Key Insights**: AI-generated summary

### Asking Questions

Try these example questions:

**Yes/No Questions:**
- "Does this candidate have a degree from a state university?"
- "Do they have AWS certifications?"
- "Can they lead a backend team?"

**Specific Information:**
- "How many years of React experience do they have?"
- "What companies have they worked for?"
- "What's their education background?"

**Analytical Questions:**
- "What are their main technical strengths?"
- "What leadership experience do they have?"

## 📡 API Documentation

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok"
}
```

### Upload Documents

```http
POST /api/upload
Content-Type: multipart/form-data
```

**Request:**
- `resume`: File (PDF/TXT)
- `jobDescription`: File (PDF/TXT)

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "matchScore": 75,
  "strengths": [
    "5+ years of Node.js and React experience",
    "Strong backend architecture skills",
    "Experience with PostgreSQL"
  ],
  "gaps": [
    "No Kubernetes experience",
    "Limited AWS cloud experience"
  ],
  "insights": "Strong candidate with solid full-stack experience..."
}
```

### Ask Question

```http
POST /api/chat
Content-Type: application/json
```

**Request:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "question": "Does this candidate have React experience?"
}
```

**Response:**
```json
{
  "answer": "Yes, the candidate has 5 years of React experience, working with Redux and TypeScript in production environments.",
  "sources": ["experience", "skills"]
}
```

## 🧪 Testing

### Sample Data

The project includes 4 sample files in `sample-data/`:

1. **resume1.txt** - Full Stack Developer (5 years)
2. **resume2.txt** - Senior Cloud Engineer (6 years)
3. **resume3.txt** - Junior Developer (3 years)
4. **job-description.txt** - Backend Developer role
5. **cloud-engineer-job.txt** - Cloud Engineer role
6. **cloud-engineer-resume.txt** - Cloud Engineer candidate

### Test Scenarios

See [TESTING_SCENARIOS.md](./TESTING_SCENARIOS.md) for detailed test cases.

### Verifying RAG Implementation

Check backend logs for:
```
🔮 Generating embeddings and storing in Pinecone...
✓ Stored 8 vectors in Pinecone
🔍 Searching vectors in Pinecone...
✓ Found 4 matches
```

## 📁 Project Structure

```
resume-screening-rag/
├── backend/                    # Node.js backend
│   ├── src/
│   │   ├── config/            # Configuration (OpenAI)
│   │   ├── services/          # Business logic
│   │   │   ├── pdfParser.ts   # PDF extraction & chunking
│   │   │   ├── embeddingService.ts  # Generate embeddings
│   │   │   ├── vectorStore.ts # Pinecone operations
│   │   │   ├── ragService.ts  # RAG implementation
│   │   │   └── matchingService.ts   # Match scoring
│   │   ├── routes/            # API endpoints
│   │   │   ├── upload.ts      # File upload
│   │   │   └── chat.ts        # Chat Q&A
│   │   ├── types/             # TypeScript types
│   │   └── server.ts          # Express app
│   ├── .env                   # Environment variables
│   └── package.json
│
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── FileUpload.tsx
│   │   │   ├── MatchAnalysis.tsx
│   │   │   └── ChatInterface.tsx
│   │   ├── services/
│   │   │   └── api.ts         # API client
│   │   ├── App.tsx            # Main app
│   │   └── main.tsx           # Entry point
│   └── package.json
│
├── sample-data/               # Test files
├── ARCHITECTURE.md            # System design
├── TESTING_SCENARIOS.md       # Test cases
└── README.md                  # This file
```

## 🎯 Key Features Explained

### 1. True RAG Implementation

This is NOT just sending resumes to an LLM. It's a proper RAG system:

- ✅ **Vector Embeddings**: Converts text to numerical vectors
- ✅ **Semantic Search**: Finds relevant content by meaning, not keywords
- ✅ **Context Retrieval**: Only sends relevant chunks to LLM
- ✅ **Source Attribution**: Shows which resume sections were used

### 2. Intelligent Chunking

Documents are split intelligently:
- **Resumes**: By sections (Experience, Education, Skills, etc.)
- **Job Descriptions**: By requirements and paragraphs
- **Overlap**: 50 tokens between chunks for context continuity

### 3. Accurate Scoring

Match scores are based on:
- Skills match (40%)
- Experience match (30%)
- Education match (20%)
- Keywords match (10%)

### 4. Role-Aware Responses

The AI understands role distinctions:
- DevOps Engineer ≠ Backend Developer
- Leading DevOps team ≠ Leading Backend Dev team
- Infrastructure experience ≠ Application development

## 🔒 Security

- API keys stored in environment variables
- File size limits (10MB)
- Input validation and sanitization
- CORS configuration
- Session-based data isolation

## 📊 Performance

| Operation | Time | Details |
|-----------|------|---------|
| Upload & Analysis | 5-10s | PDF parse → Chunk → Embed → Store → Analyze |
| Chat Response | 2-3s | Embed query → Search → Generate |
| Vector Search | <100ms | Pinecone semantic search |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 👥 Authors

Built for JobTalk.ai Backend Developer Assessment

## 📞 Support

For questions or issues, please contact: aaryanacharya12003@gmail.com

---

**Built with ❤️ using OpenAI, Pinecone, React, and Node.js**
