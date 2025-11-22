import React, { useState } from 'react';

interface FileUploadProps {
  onUpload: (resume: File, jobDescription: File) => void;
  loading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, loading }) => {
  const [resume, setResume] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resume && jobDescription) {
      onUpload(resume, jobDescription);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Upload Documents</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            📄 Resume
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setResume(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-blue-600 file:to-indigo-600 file:text-white hover:file:from-blue-700 hover:file:to-indigo-700 file:cursor-pointer file:transition-all border border-gray-300 rounded-lg p-2 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
          {resume && (
            <p className="mt-2 text-xs text-green-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {resume.name}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            📋 Job Description
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setJobDescription(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-blue-600 file:to-indigo-600 file:text-white hover:file:from-blue-700 hover:file:to-indigo-700 file:cursor-pointer file:transition-all border border-gray-300 rounded-lg p-2 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
          {jobDescription && (
            <p className="mt-2 text-xs text-green-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {jobDescription.name}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!resume || !jobDescription || loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg flex items-center justify-center"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing with AI...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Analyze Resume
            </>
          )}
        </button>
      </form>
    </div>
  );
};
