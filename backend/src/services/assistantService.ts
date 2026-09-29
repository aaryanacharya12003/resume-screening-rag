import { groq, GROQ_CHAT_MODEL } from '../config/groq';
import { contentLoss, findNewSkillItems, findUnsupported } from '../lib/honesty';
import { MatchAnalysis } from '../types';

// Resume assistant: a chat that gathers details from the candidate and folds them into the resume.
// The resume and what the candidate says in the chat are the only sources of facts; every proposed
// version is checked in code the same way Boost drafts are.

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantAnswer {
  reply: string;
  /** Present when the assistant changed the resume: the full new text and what changed. */
  proposal?: { text: string; changes: string[]; removed: string[] };
}

// Groq's free tier counts prompt + max_tokens against 8,000 tokens per minute per key.
const REQUEST_TOKEN_BUDGET = 7600;
const est = (s: string) => Math.ceil(s.length / 3.2);

function buildPrompt(resume: string, analysis: MatchAnalysis | undefined, turns: ChatTurn[], fix: string) {
  const gaps = [
    ...(analysis?.issues ?? []).slice(0, 5).map((i) => `- ${i.title}`),
    ...((analysis?.keywords?.missing ?? []).length ? [`- Skills the target role expects that the resume doesn't show: ${analysis!.keywords.missing.slice(0, 8).join(', ')}`] : []),
  ].join('\n');
  const chat = turns.map((t) => `${t.role === 'user' ? 'CANDIDATE' : 'ASSISTANT'}: ${t.content}`).join('\n\n');
  return `You are Resumint's resume assistant. You help the candidate improve their resume by chatting: you collect real details from them and update the resume with those details.

RULES (a resume that breaks them is thrown away):
- The only sources of facts are the RESUME below and what the CANDIDATE says in this chat. Never invent numbers, employers, job titles, dates, degrees, certifications, skills, tools or achievements. Never assume a detail the candidate hasn't stated.
- If the candidate's request is vague (e.g. "add my AWS certification" without the exact name or year), ask for the missing specifics instead of guessing.
- Ask at most one question at a time, short and specific. Prefer the gaps listed below: measurable results, scope, tools used, dates, certifications, links.
- When the candidate gives you facts or asks for a change, update the resume: put each fact in the right section and role, keep every existing detail unless they asked to remove it, keep the same plain-text layout (CAPS section headings, "• " bullets, one "Role | Company | Dates" line per job).
- Candidate claims that look like skills or credentials must be added exactly as they stated them.

WHAT THE RESUME IS MISSING (from the last review):
${gaps || '- (no review available)'}

RESUME:
${resume.slice(0, 14000)}

CHAT SO FAR:
${chat}
${fix ? `\nFIX FROM YOUR PREVIOUS ANSWER:\n${fix}\n` : ''}
Reply in EXACTLY this format:
===REPLY===
<your message to the candidate: what you changed (briefly) and/or your next question>
===RESUME===
<the full updated resume, ONLY if you changed it in this answer; otherwise write NONE>
===CHANGES===
- <each change you made, or NONE>
===END===`;
}

async function ask(prompt: string, resumeLength: number) {
  const maxTokens = Math.max(1500, Math.min(REQUEST_TOKEN_BUDGET - est(prompt), 900 + Math.ceil(resumeLength / 2.8)));
  const r = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: maxTokens,
    ...({ reasoning_effort: 'low' } as object),
  });
  const out = r.choices[0].message.content || '';
  const part = (name: string, next: string) => (out.match(new RegExp(`===${name}===\\s*([\\s\\S]*?)\\s*(?:===${next}===|===END===|$)`))?.[1] ?? '').trim();
  const reply = part('REPLY', 'RESUME');
  const text = part('RESUME', 'CHANGES');
  const changes = part('CHANGES', 'END')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((l) => l && !/^none$/i.test(l));
  return { reply, text: /^none$/i.test(text) || text.length < 200 ? '' : text, changes };
}

/**
 * One assistant turn. Proposed resumes are checked against the resume plus everything the
 * candidate said: invented skills, numbers or SKILLS items get one retry, then the change is refused.
 */
export async function assistantTurn(
  resume: string,
  analysis: MatchAnalysis | undefined,
  turns: ChatTurn[],
  /** An unapplied proposal from earlier in the chat: further edits build on it. */
  draft?: string,
): Promise<AssistantAnswer> {
  const said = turns.filter((t) => t.role === 'user').map((t) => t.content).join('\n');
  // Facts may come only from the saved resume and the candidate's own messages (a draft was built from those).
  const allowed = `${resume}\n${said}`;
  const base = draft || resume;
  const guardTerms = [...(analysis?.keywords?.missing ?? []), ...(analysis?.keywords?.have ?? [])];
  let fix = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const a = await ask(buildPrompt(base, analysis, turns, fix), base.length);
    if (!a.text) return { reply: a.reply || 'Tell me what you would like to add or change.' };
    const invented = [...findUnsupported(allowed, a.text, guardTerms), ...findNewSkillItems(allowed, a.text)];
    if (!invented.length) {
      // Lines the candidate didn't ask to remove still show up in the diff; they're listed so the
      // candidate can spot an accidental loss before applying.
      const removed = contentLoss(base, a.text).lost.slice(0, 8);
      return { reply: a.reply, proposal: { text: a.text, changes: a.changes.slice(0, 10), removed } };
    }
    console.warn(`  ⚠ assistant draft invented: ${invented.join(', ')}`);
    fix = `Your resume added things neither the resume nor the candidate stated: ${invented.join(', ')}. Remove them, or ask the candidate to confirm them first.`;
  }
  return {
    reply:
      "I couldn't make that change without adding details you haven't told me yet. Could you give me the exact specifics (names, numbers, dates) you'd like on the resume?",
  };
}
