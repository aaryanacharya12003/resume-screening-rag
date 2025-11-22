import { openai, CHAT_MODEL } from '../config/openai';
import { MatchAnalysis } from '../types';

export class MatchingService {
  async analyzeMatch(resumeText: string, jobDescriptionText: string): Promise<MatchAnalysis> {
    // Truncate texts to reduce token usage but keep more context
    const maxLength = 800;
    const resumeSummary = resumeText.substring(0, maxLength);
    const jdSummary = jobDescriptionText.substring(0, maxLength);
    
    const prompt = `You are an expert recruiter. Analyze how well this resume matches the job requirements.

JOB REQUIREMENTS:
${jdSummary}

CANDIDATE RESUME:
${resumeSummary}

Provide accurate analysis in JSON format:
{
  "score": <number 0-100>,
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "gaps": ["specific gap 1", "specific gap 2"],
  "insights": "2-3 sentence overall assessment"
}

Be specific and accurate. Base score on actual qualifications match.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2, // Lower for more consistent scoring
        max_tokens: 600,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        score: result.score || 0,
        strengths: result.strengths || [],
        gaps: result.gaps || [],
        insights: result.insights || '',
      };
    } catch (error) {
      console.error('Error analyzing match:', error);
      throw new Error('Failed to analyze match');
    }
  }
}
