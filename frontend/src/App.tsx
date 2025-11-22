import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { MatchAnalysis } from './components/MatchAnalysis';
import { ChatInterface } from './components/ChatInterface';
import { uploadFiles, askQuestion, UploadResponse } from './services/api';

function App() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (resume: File, jobDescription: File) => {
    setLoading(true);
    setError(null);

    try {
      const result = await uploadFiles(resume, jobDescription);
      setAnalysis(result);
    } catch (err) {
      setError('Failed to analyze files. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (question: string) => {
    if (!analysis) throw new Error('No session available');
    return await askQuestion(analysis.sessionId, question);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  AI Resume Screening
                </h1>
                <p className="text-sm text-gray-500">Powered by RAG Technology</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                ✓ RAG Enabled
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <FileUpload onUpload={handleUpload} loading={loading} />
          
          {analysis && (
            <MatchAnalysis
              matchScore={analysis.matchScore}
              strengths={analysis.strengths}
              gaps={analysis.gaps}
              insights={analysis.insights}
            />
          )}
        </div>

        {analysis && (
          <ChatInterface
            onAskQuestion={handleAskQuestion}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            Built with OpenAI Embeddings + Pinecone Vector Database + GPT-3.5
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
