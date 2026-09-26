import { coolDownMs, groq, GROQ_CHAT_MODEL } from '../config/groq';
import { MatchAnalysis } from '../types';
import { placeholderizeNumbers } from '../lib/honesty';
import { HttpError } from '../lib/http';

// Whole resume: a 2-page resume is ~8-9k chars. (This used to be 6000, which silently cut off
// education, certifications and projects and skewed scores.)
const MAX_CHARS = 15000;

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
/** Overall resume-quality score: the rounded mean of the four category scores. */
export const categoryAverage = (c: { ats: number; impact: number; keywords: number; readability: number }) =>
  Math.round((c.ats + c.impact + c.keywords + c.readability) / 4);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export class MatchingService {
  /** JSON-mode scoring call; retried once because the provider occasionally fails to emit valid JSON. */
  private async scoreWithRetry(prompt: string): Promise<any> {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await groq.chat.completions.create({
          model: GROQ_CHAT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0, // deterministic scoring so versions of a resume are comparable
          seed: 7, // fixed seed: the provider is otherwise slightly non-deterministic even at temperature 0
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        });
        const parsed = JSON.parse(response.choices[0].message.content || '{}');
        // An empty or partial answer would turn into all-zero scores; treat it as a failed call.
        const cats = parsed?.categories;
        if (!cats || !['ats', 'impact', 'keywords', 'readability'].every((k) => Number(cats[k]) > 0)) {
          throw new Error('The scorer returned an incomplete result');
        }
        return parsed;
      } catch (e) {
        if (attempt >= 3) throw e;
        // Every key was rate-limited: wait out a short per-minute limit (not a long daily one) before retrying.
        const wait = (e as { status?: number })?.status === 429 ? Math.min(coolDownMs(e), 60000) : 1000;
        console.warn(`  ↻ scoring retry in ${Math.round(wait / 1000)}s: ${String((e as Error)?.message).slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  /**
   * Full recruiter-style report. The job description is optional: without it the
   * keyword/match fields describe general fit for the candidate's apparent target role.
   */
  async analyzeMatch(resumeText: string, jobDescriptionText?: string): Promise<MatchAnalysis> {
    const resume = resumeText.substring(0, MAX_CHARS);
    const jd = jobDescriptionText?.substring(0, MAX_CHARS);

    const prompt = `You are a senior technical recruiter and ATS expert reviewing a resume${jd ? ' against a job description' : ''}.

${jd ? `JOB DESCRIPTION:\n${jd}\n\n` : ''}RESUME:
${resume}

Return ONLY JSON in this exact shape:
{
  "candidateName": "<name from resume or empty string>",
  "targetRole": "<role this resume targets${jd ? ' (use the JD title)' : ''}>",
  "score": <0-100 overall ${jd ? 'fit for this job' : 'resume quality'}>,
  "categories": { "ats": <0-100 ATS parseability>, "impact": <0-100 quantified achievements>, "keywords": <0-100 keyword coverage>, "readability": <0-100 clarity and structure> },
  "strengths": ["specific strength", "..."],
  "gaps": ["specific gap", "..."],
  "issues": [ { "severity": "high|medium|low", "title": "short issue title", "detail": "why it hurts + how to fix", "check": "one of: ATS parsing, Quantified impact, Weak action verbs, Keyword match, Readability, Bullet length, Passive voice, Contact info, Section order, Date formatting, Buzzwords, Skills gap, Job-title alignment" } ],
  "keywords": { "have": ["skill found in resume"], "missing": ["important skill ${jd ? 'from the JD' : 'for the target role'} not proven in resume"] },
  "rewrites": [ { "before": "exact weak bullet from the resume", "after": "stronger, quantified rewrite (use placeholders like X% if numbers are unknown)", "why": "what improved" } ],
  "insights": "2-3 sentence overall assessment"
}
Give 3-5 strengths, 2-5 gaps, 4-8 issues ordered by severity, up to 12 keywords each, and 3 rewrites. Be specific to this resume; do not invent experience.
Bracketed placeholders such as [X%] or [N users] are metrics the candidate will fill in before applying: score them as quantified results, do not lower the ATS or readability score for them, and do not list them as issues.
Score "ats" only on how reliably an applicant tracking system can parse the text: contact details present and plain, standard section headings, consistent dates, plain bullets, no tables/columns/graphics/special characters. Wording quality belongs in the other categories.`;

    try {
      const r = await this.scoreWithRetry(prompt);
      const cat = r.categories || {};
      const categories = { ats: clamp(cat.ats), impact: clamp(cat.impact), keywords: clamp(cat.keywords), readability: clamp(cat.readability) };
      return {
        // Without a job description the overall score is simply the average of the four categories, so
        // it moves exactly when they do. With a JD it stays the model's "fit for this job" judgment.
        score: jd ? clamp(r.score) : categoryAverage(categories),
        candidateName: typeof r.candidateName === 'string' ? r.candidateName : '',
        targetRole: typeof r.targetRole === 'string' ? r.targetRole : '',
        categories,
        strengths: strings(r.strengths),
        gaps: strings(r.gaps),
        issues: Array.isArray(r.issues)
          ? r.issues
              .filter((i: any) => i && i.title)
              .map((i: any) => ({
                severity: ['high', 'medium', 'low'].includes(i.severity) ? i.severity : 'medium',
                title: String(i.title),
                detail: String(i.detail || ''),
                check: String(i.check || ''),
              }))
          : [],
        keywords: { have: strings(r.keywords?.have), missing: strings(r.keywords?.missing) },
        rewrites: Array.isArray(r.rewrites)
          ? r.rewrites
              .filter((w: any) => w && w.before && w.after)
              // Suggested bullets must not invent metrics: unknown numbers become [X] placeholders.
              .map((w: any) => ({
                before: String(w.before),
                after: placeholderizeNumbers(resumeText, String(w.after)),
                why: String(w.why || ''),
              }))
          : [],
        insights: typeof r.insights === 'string' ? r.insights : '',
        hasJobDescription: Boolean(jd),
      };
    } catch (error) {
      console.error('Error analyzing match:', error);
      // The AI provider is out of capacity (per-minute or daily limit): say so, with a rough wait,
      // instead of a generic failure. Nothing is saved, so the user's scan allowance is untouched.
      if ((error as { status?: number })?.status === 429) {
        const mins = Math.max(1, Math.ceil(coolDownMs(error) / 60000));
        throw new HttpError(
          503,
          `Our AI reviewer is at capacity right now. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}; your scan wasn't used.`,
          'AI_BUSY',
        );
      }
      throw new Error('Failed to analyze match');
    }
  }
}
