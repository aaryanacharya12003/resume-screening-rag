import React from 'react';

interface MatchAnalysisProps {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  insights: string;
}

export const MatchAnalysis: React.FC<MatchAnalysisProps> = ({
  matchScore,
  strengths,
  gaps,
  insights,
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Match Analysis</h2>
      </div>

      {/* Score Card */}
      <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Match Score</span>
          <span className={`text-5xl font-bold ${getScoreColor(matchScore)}`}>
            {matchScore}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
          <div
            className={`h-4 rounded-full transition-all duration-1000 ease-out ${
              matchScore >= 80 ? 'bg-gradient-to-r from-green-500 to-green-600' : 
              matchScore >= 60 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' : 
              'bg-gradient-to-r from-red-500 to-red-600'
            }`}
            style={{ width: `${matchScore}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-600 text-center">
          {matchScore >= 80 ? '🎯 Excellent Match' : matchScore >= 60 ? '✓ Good Match' : '⚠ Needs Review'}
        </p>
      </div>

      {/* Strengths */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Strengths</h3>
        </div>
        <ul className="space-y-2.5">
          {strengths.map((strength, index) => (
            <li key={index} className="flex items-start bg-green-50 rounded-lg p-3 border border-green-100">
              <span className="text-green-600 mr-2 mt-0.5">✓</span>
              <span className="text-gray-800 text-sm">{strength}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Gaps */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Areas for Improvement</h3>
        </div>
        <ul className="space-y-2.5">
          {gaps.map((gap, index) => (
            <li key={index} className="flex items-start bg-red-50 rounded-lg p-3 border border-red-100">
              <span className="text-red-600 mr-2 mt-0.5">✗</span>
              <span className="text-gray-800 text-sm">{gap}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Insights */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-5 border border-blue-100">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-2">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">Key Insights</h3>
        </div>
        <p className="text-gray-700 leading-relaxed text-sm">{insights}</p>
      </div>
    </div>
  );
};
