import { prisma } from '../config/db';
import { groq, GROQ_CHAT_MODEL } from '../config/groq';
import { MatchAnalysis } from '../types';
import { categoryAverage, MatchingService } from './matchingService';
import { contentLoss, findNewSkillItems, findUnsupported, insertSkills, norm } from '../lib/honesty';

export const TARGET_SCORE = 90;
// Passes stop as soon as a version reaches TARGET_SCORE; each pass edits the best version so far.
// Enough for: work in the candidate's results, repair what that cost, then polish.
const MAX_ATTEMPTS = Number(process.env.OPT_PASSES || 4);
// Vercel stops a function after 300 s. A pass can take about a minute when the AI provider makes us
// wait, so no new pass starts after this point and the best version so far is saved.
const PASS_START_BUDGET_MS = 180_000;

const CATEGORY_KEYS = ['ats', 'impact', 'keywords', 'readability'] as const;
const CATEGORY_LABEL: Record<(typeof CATEGORY_KEYS)[number], string> = { ats: 'ATS', impact: 'Impact', keywords: 'Keywords', readability: 'Readability' };

/** Categories where `next` scores below `base`. An enhanced version must never lose ground anywhere. */
function regressions(base: MatchAnalysis, next: MatchAnalysis) {
  return CATEGORY_KEYS.filter((k) => (Number(next.categories?.[k]) || 0) < (Number(base.categories?.[k]) || 0)).map((k) => ({
    key: k,
    label: CATEGORY_LABEL[k],
    from: Number(base.categories?.[k]) || 0,
    to: Number(next.categories?.[k]) || 0,
  }));
}

const matchingService = new MatchingService();

export interface OptimizeResult {
  resumeText: string;
  analysis: MatchAnalysis;
  changes: string[];
  attempts: number;
  reachedTarget: boolean;
  /** The saved version scores higher than the original. */
  improved: boolean;
  /** An honest rewrite exists (it may score the same as the original); false means nothing to save. */
  hasDraft: boolean;
  /** Skills the job wants that the candidate hasn't shown; the only honest route to a higher score. */
  blockers: string[];
  /** Drafts thrown away because they claimed things the original resume doesn't support. */
  rejectedDrafts: number;
  /** Categories a rejected draft would have lowered (e.g. ["ATS"]). */
  regressed: string[];
}

export type Progress = (step: string) => void;

/* ---------------- rewrite ---------------- */

/** Concrete, honest ways to lift each category; only the ones still below target are sent. */
const TACTICS: Record<(typeof CATEGORY_KEYS)[number], (hasJd: boolean) => string> = {
  impact: () =>
    'IMPACT: first work every result the candidate confirmed into its bullet, keeping the bullet about as long as before: start with the action verb, state the work briefly, and end with ONE result, the strongest (e.g. "Built the React checkout, cutting page load to N s"). Keep each bullet under about twenty words; drop filler to make room. Then make the result of each other piece of work explicit using only facts already in the resume (what improved, for whom, at what scale, how often). Lead with the outcome, bring numbers that are already there to the front of the bullet, and use specific action verbs. Do not add bracketed placeholders or new numbers.',
  keywords: (hasJd) =>
    hasJd
      ? "KEYWORDS: for skills the resume ALREADY shows, use the job description's exact wording (e.g. 'Kubernetes (k8s)' if the resume says k8s). Mention each such skill in SKILLS and in at least one bullet where it was used. Order SKILLS and bullets by relevance to the job. Never add a skill the resume doesn't show, and never add capability phrases it doesn't state (for example orchestration, scalability or security claims around a tool it lists)."
      : 'KEYWORDS: use the standard industry names for the skills and tools the resume already shows (full name plus common abbreviation), mention each in SKILLS and in a bullet where it was used, most relevant first. Never add a skill the resume does not show.',
  readability: () =>
    'READABILITY: one idea per bullet, under about twenty words each; split a bullet that carries two ideas or two results into two bullets. Past tense for past roles, no dense paragraphs, no repeated verbs within a role, no vague filler ("improved", "various", "responsible for").',
  ats: () =>
    'ATS: plain text only, contact details on the first lines, standard CAPS section headings, one date format, "Role | Company | Dates" per job, no symbols or emoji.',
};

// Which of the scorer's issue checks belong to which category.
const CHECKS: Record<(typeof CATEGORY_KEYS)[number], string[]> = {
  impact: ['Quantified impact', 'Weak action verbs'],
  readability: ['Readability', 'Bullet length', 'Passive voice', 'Buzzwords'],
  keywords: ['Keyword match', 'Skills gap', 'Job-title alignment'],
  ats: ['ATS parsing', 'Contact info', 'Section order', 'Date formatting'],
};

type CategoryKey = (typeof CATEGORY_KEYS)[number];
const byWeakest = (a: MatchAnalysis) =>
  [...CATEGORY_KEYS].sort((x, y) => (Number(a.categories?.[x]) || 0) - (Number(a.categories?.[y]) || 0));

/**
 * Instructions for one pass. Each pass works on a single area: broad rewrites kept trading one
 * category for another, focused edits don't. Scores are described in words only, because the
 * rewriter copies any number it sees into the resume.
 */
function feedbackFrom(a: MatchAnalysis, hasJd: boolean, focus: CategoryKey) {
  const issues = (a.issues ?? []).filter((i) => CHECKS[focus].includes(i.check));
  const suggested = focus === 'impact' || focus === 'readability' ? (a.rewrites ?? []).filter((r) => r.before && r.after && !/\[[^\]]*\]/.test(r.after)).slice(0, 5) : [];
  return [
    `FOCUS AREA FOR THIS EDIT: ${CATEGORY_LABEL[focus]}. Areas from weakest to strongest: ${byWeakest(a).map((k) => CATEGORY_LABEL[k]).join(', ')}.`,
    `HOW: ${TACTICS[focus](hasJd)}`,
    issues.length ? `Issues a recruiter flagged in this area:\n${issues.map((i) => `- ${i.title}: ${i.detail}`).join('\n')}` : '',
    suggested.length
      ? `Bullet rewrites a recruiter suggested (apply the wording, but never add placeholders or numbers that aren't in the resume):\n${suggested.map((r) => `- "${r.before}" -> "${r.after}"`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Groq's free tier counts prompt + max_tokens against 8,000 tokens per minute per key; a request
// over that is refused outright, so the prompt and the reply budget are sized to fit under it.
const REQUEST_TOKEN_BUDGET = 7600;
const estTokens = (text: string) => Math.ceil(text.length / 3.2);

async function rewrite(resume: string, jd: string | undefined, feedback: string, forbidden: string[], base?: string) {
  const build = (withOriginal: boolean) => `You are an expert resume editor making a focused edit to a resume${jd ? ' for the job description below' : ''}. Improve only the focus area named below. You may only rephrase and tighten what is already there.

STRICT HONESTY RULES (a draft that breaks any of these is thrown away):
- Keep every employer, job title, date, degree, school and certification exactly as given.
- Do NOT add any skill, tool, technology, responsibility, project or achievement that is not already stated in the resume.
- The candidate does NOT have these, so never mention them anywhere: ${forbidden.length ? forbidden.join(', ') : '(none listed)'}.
- Keep EVERY role, bullet, project, tool, technology, version number and detail from the resume. Do not shorten it by removing content; only improve the wording.
- Never invent or change numbers. Keep numbers that are in the resume. Do not add bracketed placeholders like [X%].

EDITING RULES (the edited resume is re-scored in every area, and it is rejected if ANY area gets worse):
- This is an edit, not a rewrite. Copy every line exactly unless changing it clearly improves the focus area.
- Keep the same sections, section order, headings and roles, and keep every bullet. Do not merge or reorder content (splitting a bullet that carries two ideas is fine).
- Keep bullets short and scannable: one idea each, one or two lines. Never make a bullet longer than it needs to be.
- Protect ATS parsing, never make it worse: keep the name and every contact detail (email, phone, location, LinkedIn/GitHub/portfolio links) as plain text on the first lines; use standard section headings only; one date format everywhere (e.g. "Mon YYYY – Present"); no emoji, icons, decorative symbols or text art.
- Keep exact skill and tool names as written in the resume (recruiter searches match them literally); list every one of them in SKILLS.
- If the resume has a SUMMARY, keep it to a tight two or three lines built only from facts in the resume${jd ? ', emphasising the parts most relevant to this job' : ''}.

${jd ? `JOB DESCRIPTION (for emphasis only, not a source of new skills):\n${jd.slice(0, 3000)}\n\n` : ''}WHAT TO IMPROVE:
${feedback}

${withOriginal ? `ORIGINAL RESUME (the only source of facts):\n${resume.slice(0, 15000)}\n` : resume.includes(CONFIRMED_MARK) ? `${resume.slice(resume.indexOf(CONFIRMED_MARK)).trim()}\n` : ''}${base ? `\nCURRENT VERSION TO EDIT (start from THIS text and change only what the focus area needs; keep every fact in it and add none):\n${base.slice(0, 15000)}\n` : ''}
Reply in EXACTLY this format and nothing else:
===RESUME===
<the full edited resume as plain text>
===CHANGES===
- <short description of an important change>
- <another change>
===END===`;
  // The draft to edit already carries every original fact (it passed the fact check), so on long
  // resumes the original is left out rather than blowing the request budget.
  let prompt = build(true);
  const replyNeed = (text: string) => 1200 + estTokens(text);
  if (base && estTokens(prompt) + replyNeed(base) > REQUEST_TOKEN_BUDGET) prompt = build(false);
  const maxTokens = Math.max(1500, Math.min(REQUEST_TOKEN_BUDGET - estTokens(prompt), replyNeed(base ?? resume)));

  // Plain-text markers instead of JSON mode: a whole resume full of quotes and line breaks
  // regularly makes the provider's JSON mode fail ("Failed to generate JSON").
  const response = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    // Room for the whole resume (~1 token per 3.5 chars) plus some reasoning; small resumes stay cheap
    // for the free-tier tokens/min cap, long ones aren't cut short.
    max_tokens: maxTokens,
    // gpt-oss "thinks" before answering and that counts toward max_tokens; editing needs little of it.
    ...({ reasoning_effort: 'low' } as object),
  });
  const out = response.choices[0].message.content || '';
  // Tolerate a missing CHANGES/END marker (e.g. the answer was cut short): keep whatever resume text arrived.
  const text = (out.match(/===RESUME===\s*([\s\S]*?)\s*(?:===CHANGES===|===END===|$)/)?.[1] ?? '').trim();
  const changesBlock = out.match(/===CHANGES===\s*([\s\S]*?)(?:===END===|$)/)?.[1] ?? '';
  if (text.length < 200) throw new Error('The optimizer returned an empty resume');
  const changes = changesBlock
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((l) => l.length > 3);
  return { text, changes };
}

/** How long the provider asked us to back off, e.g. "Please try again in 11.93s" (Groq free tier: 8k tokens/min). */
function retryDelayMs(e: any) {
  const hinted = String(e?.message ?? '').match(/try again in ([\d.]+)s/i);
  if (hinted) return Math.ceil(Number(hinted[1]) * 1000) + 500;
  return e?.status === 429 ? 15000 : 1000;
}

/**
 * Runs an LLM step with retries: per-minute rate limits (Groq free tier) clear within seconds, so
 * wait what the provider asks and try again, up to 3 times. A daily-limit cooldown fails fast.
 */
async function withRetry<T>(fn: () => Promise<T>, progress?: Progress): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const wait = retryDelayMs(e);
      const limit = e?.status === 429 ? 3 : 1;
      if (attempt >= limit || wait > 90_000) throw e;
      console.warn(`  ↻ retry ${attempt + 1}/${limit} in ${Math.round(wait / 1000)}s after: ${String(e?.message || e).slice(0, 120)}`);
      if (wait > 3000) progress?.('AI is busy, waiting a few seconds');
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// A rewrite may reword, but must not quietly shed content: at most 2 lost facts, and ≥ 80% of the length.
const MAX_LOST_FACTS = 2;
const MIN_LENGTH_RATIO = 0.8;

/**
 * `allowed` = original + skills the user confirmed (may appear in the draft).
 * `source` = the untouched original (every fact in it must survive).
 */
function checkDraft(allowed: string, source: string, text: string, guardTerms: string[]) {
  const invented = [...findUnsupported(allowed, text, guardTerms), ...findNewSkillItems(allowed, text)];
  const loss = contentLoss(source, text);
  const dropped = loss.lost.length > MAX_LOST_FACTS ? loss.lost : [];
  const tooShort = loss.lengthRatio < MIN_LENGTH_RATIO;
  return { invented, dropped, tooShort, ok: !invented.length && !dropped.length && !tooShort };
}

/** One honest draft: rewrite, check it, one repair round if needed. Returns null if it still invents or drops things. */
async function honestDraft(
  original: string,
  source: string,
  jd: string | undefined,
  feedback: string,
  forbidden: string[],
  guardTerms: string[],
  progress: Progress,
  base?: string,
) {
  let draft = await withRetry(() => rewrite(original, jd, feedback, forbidden, base), progress);
  let check = checkDraft(original, source, draft.text, guardTerms);
  if (!check.ok) {
    const c = check;
    progress(c.invented.length ? 'Removing claims your resume does not support' : 'Restoring details the rewrite left out');
    console.log(`  ⚠ draft needs repair: invented [${c.invented.join(', ')}] dropped [${c.dropped.join(', ')}]${c.tooShort ? ' too short' : ''}`);
    const fixes = [
      c.invented.length ? `YOUR LAST DRAFT INVENTED THESE, WHICH ARE NOT IN THE ORIGINAL. REMOVE THEM: ${c.invented.join(', ')}` : '',
      c.dropped.length ? `YOUR LAST DRAFT DROPPED THESE DETAILS FROM THE ORIGINAL. PUT EVERY ONE BACK: ${c.dropped.join(', ')}` : '',
      c.tooShort ? 'YOUR LAST DRAFT WAS MUCH SHORTER THAN THE ORIGINAL. KEEP EVERY BULLET, ROLE, PROJECT AND DETAIL; ONLY IMPROVE THE WORDING.' : '',
    ].filter(Boolean);
    draft = await withRetry(
      () =>
        rewrite(original, jd, `${feedback}\n${fixes.join('\n')}`, [...forbidden, ...c.invented.filter((p) => !p.startsWith('the number'))], base),
      progress,
    );
    check = checkDraft(original, source, draft.text, guardTerms);
  }
  return check.ok ? draft : null;
}

/**
 * AI scores of the same text wobble by several points per category, so a draft is scored twice
 * and the two results averaged before it's compared with the original.
 */
async function scoreDraft(text: string, jd: string | undefined, progress: Progress): Promise<MatchAnalysis> {
  const a = await withRetry(() => matchingService.analyzeMatch(text, jd), progress);
  const b = await withRetry(() => matchingService.analyzeMatch(text, jd), progress).catch(() => a);
  const categories = Object.fromEntries(
    CATEGORY_KEYS.map((k) => [k, Math.round(((Number(a.categories[k]) || 0) + (Number(b.categories[k]) || 0)) / 2)]),
  ) as MatchAnalysis['categories'];
  return {
    ...a,
    categories,
    score: jd ? Math.round((a.score + b.score) / 2) : categoryAverage(categories),
    // Anything either run "found" is checked by the honesty guard.
    keywords: { ...a.keywords, have: [...new Set([...(a.keywords?.have ?? []), ...(b.keywords?.have ?? [])])] },
  };
}

/** A missing skill the candidate says they genuinely have, with an optional one-line detail. */
export interface ConfirmedSkill {
  skill: string;
  detail?: string;
}

/** A real outcome the candidate supplied for one of their bullets ("cut load time from 4s to 1.2s"). */
export interface ConfirmedResult {
  bullet: string;
  result: string;
}

/** Everything the candidate confirmed is appended under this marker, so it can travel with the facts. */
const CONFIRMED_MARK = '\n\n=== CONFIRMED BY THE CANDIDATE (true facts) ===\n';

/**
 * Rewrite → fact-check → re-score, keeping the best honest version.
 * The score only goes up through better writing and skills the candidate confirmed;
 * anything else the job wants is reported as a blocker, never added.
 */
export async function optimizeResume(
  originalText: string,
  jd: string | undefined,
  current: MatchAnalysis,
  progress: Progress = () => undefined,
  confirmed: ConfirmedSkill[] = [],
  results: ConfirmedResult[] = [],
): Promise<OptimizeResult> {
  const startedAt = Date.now();
  const isConfirmed = (term: string) => confirmed.some((c) => norm(c.skill) === norm(term));
  // Skills the user vouched for become facts the rewrite may use (and the guard accepts).
  // Skills and results the user supplied are facts the rewrite may use (and the guard accepts).
  const confirmedBlocks = [
    confirmed.length
      ? `Skills (add each to SKILLS and to the role where it was used):\n${confirmed.map((c) => `- ${c.skill}${c.detail ? `: ${c.detail}` : ''}`).join('\n')}`
      : '',
    results.length
      ? `Results of specific bullets (work each result into the bullet it belongs to, keeping the bullet tight):\n${results.map((r) => `- "${r.bullet}" -> ${r.result}`).join('\n')}`
      : '',
  ].filter(Boolean);
  const resumeText = confirmedBlocks.length ? `${originalText}${CONFIRMED_MARK}${confirmedBlocks.join('\n\n')}` : originalText;
  const forbidden = (current.keywords?.missing ?? []).filter((t) => !isConfirmed(t));
  const guardTerms = [...forbidden, ...(current.keywords?.have ?? [])];
  // `best` is the version that will be saved: the highest-scoring draft with NO category below the
  // original. `work` is the version the next pass edits. It may dip in a category for a while
  // (adding results makes bullets longer and Readability drops), and the next pass repairs that
  // category, so improvements that need two steps can still get through the floor.
  let bestText = originalText;
  let best = current;
  let changes: string[] = [];
  let workText = originalText;
  let work = current;
  let workChanges: string[] = [];
  let attempts = 0;
  let rejectedDrafts = 0;
  const regressed = new Set<string>();
  let failedPasses = 0;
  const hasJd = Boolean(jd);
  const dipPoints = (a: MatchAnalysis) => regressions(current, a).reduce((sum, d) => sum + (d.from - d.to), 0);
  const catSum = (a: MatchAnalysis) => Object.values(a.categories ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  // Areas already tried on the working version without success; the next pass tries another.
  let tried = new Set<CategoryKey>();
  const firstFocus: CategoryKey[] = [...(results.length ? (['impact'] as const) : []), ...(confirmed.some((c) => c.detail) ? (['keywords'] as const) : [])];
  const nextFocus = (): CategoryKey => {
    // What the candidate supplied goes in first: their results (impact), then their skills (keywords).
    const first = firstFocus.shift();
    if (first) return first;
    // Then repair whatever the working version lost against the original, biggest loss first.
    const dip = regressions(current, work)
      .sort((x, y) => y.from - y.to - (x.from - x.to))
      .find((d) => !tried.has(d.key));
    if (dip) return dip.key;
    const order = byWeakest(work);
    const pick = order.find((k) => !tried.has(k) && (Number(work.categories?.[k]) || 0) < 100);
    if (pick) return pick;
    tried = new Set();
    return order[0];
  };
  let note = '';

  // Step 0: skills the candidate confirmed go into SKILLS in code. Nothing else changes, so the
  // other areas have no reason to drop, and later AI passes build on this version.
  if (confirmed.length) {
    progress('Adding the skills you confirmed');
    const withSkills = insertSkills(originalText, confirmed.map((c) => c.skill));
    if (withSkills !== originalText) {
      try {
        const measured = await scoreDraft(withSkills, jd, progress);
        // Only the SKILLS line changed, so ATS, Impact and Readability are carried over from the
        // original: re-scoring unchanged text only measures the scorer's noise (the same resume has
        // scored 78 and 88 an hour apart). Keywords is re-measured and counts only if it rose, and an
        // added skill the candidate has can't make the resume a worse fit, so the overall can't fall.
        const categories = {
          ...current.categories,
          keywords: Math.max(Number(current.categories.keywords) || 0, Number(measured.categories.keywords) || 0),
        } as MatchAnalysis['categories'];
        const analysis: MatchAnalysis = {
          ...measured,
          categories,
          score: jd ? Math.max(current.score, measured.score) : categoryAverage(categories),
        };
        const dips = regressions(current, analysis);
        const added = confirmed.map((c) => c.skill).filter((s) => withSkills.includes(s));
        console.log(`  ✨ skills added in code: ${current.score} → ${analysis.score}${dips.length ? ` (below original: ${dips.map((x) => `${x.label} ${x.from}→${x.to}`).join(', ')})` : ''}`);
        const skillChanges = [`Added ${added.join(', ')} to SKILLS (skills you confirmed)`];
        if (!dips.length && (analysis.score > best.score || (analysis.score === best.score && catSum(analysis) >= catSum(best)))) {
          best = analysis;
          bestText = withSkills;
          changes = skillChanges;
        } else if (dips.length) {
          dips.forEach((x) => regressed.add(x.label));
        }
        // Even when scoring noise shows a small dip, the AI passes start from the version with the skills in it.
        if (dipPoints(analysis) <= 6) {
          work = analysis;
          workText = withSkills;
          workChanges = skillChanges;
        }
      } catch (e: any) {
        console.error(`  ✖ scoring the skills version failed: ${e?.message || e}`);
      }
    }
  }
  const hadInput = confirmed.length > 0 || results.length > 0;

  while (attempts < MAX_ATTEMPTS && best.score < TARGET_SCORE) {
    // Rewording alone rarely clears the no-category-drops rule. Without any input from the
    // candidate, stop after two passes that changed nothing instead of spending two more.
    if (!hadInput && attempts >= 2 && workText === originalText) break;
    if (Date.now() - startedAt > PASS_START_BUDGET_MS) {
      console.log(`  ⏱ optimize stopped after ${attempts} passes (time budget)`);
      break;
    }
    attempts++;
    const focus = nextFocus();
    const repairing = regressions(current, work).some((d) => d.key === focus);
    const feedback = [
      feedbackFrom(work, hasJd, focus),
      repairing
        ? `${CATEGORY_LABEL[focus]} is now weaker than in the original resume. Repair it while keeping every result and improvement already in the current version.`
        : '',
      note,
    ]
      .filter(Boolean)
      .join('\n');
    progress(`${repairing ? 'Restoring' : 'Improving'} ${CATEGORY_LABEL[focus].toLowerCase()} (pass ${attempts} of up to ${MAX_ATTEMPTS})`);
    let draft: Awaited<ReturnType<typeof honestDraft>>;
    let analysis: MatchAnalysis;
    try {
      // Build on the working version so improvements add up instead of starting over each pass.
      draft = await honestDraft(resumeText, originalText, jd, feedback, forbidden, guardTerms, progress, workText === originalText ? undefined : workText);
      if (!draft) {
        rejectedDrafts++;
        tried.add(focus);
        continue;
      }
      progress(`Re-scoring pass ${attempts}`);
      const d = draft;
      analysis = await scoreDraft(d.text, jd, progress);
    } catch (e: any) {
      // A pass that fails even after retries is skipped; other passes can still succeed.
      console.error(`  ✖ optimize pass ${attempts} failed: ${e?.message || e}`);
      failedPasses++;
      continue;
    }
    // The scorer can also reveal invented skills via what it "found" in the draft.
    const late = [...findUnsupported(resumeText, draft.text, analysis.keywords.have), ...findNewSkillItems(resumeText, draft.text)];
    const dips = regressions(current, analysis);
    console.log(
      `  ✨ optimize pass ${attempts} [${focus}]: ${current.score} → ${analysis.score}${dips.length ? ` (below original: ${dips.map((x) => `${x.label} ${x.from}→${x.to}`).join(', ')})` : ''}${late.length ? ` (rejected: ${late.join(', ')})` : ''}`,
    );
    if (late.length) {
      rejectedDrafts++;
      tried.add(focus);
      continue;
    }

    // Saveable only if no category is below the original (drafts are scored twice and averaged).
    if (!dips.length) {
      const better =
        analysis.score > best.score ||
        (analysis.score === best.score && (bestText === originalText ? catSum(analysis) >= catSum(best) : catSum(analysis) > catSum(best)));
      if (better) {
        best = analysis;
        bestText = draft.text;
        changes = draft.changes;
      }
    } else {
      dips.forEach((x) => regressed.add(x.label));
    }

    // The working copy moves forward when the draft scores higher without losing much against the
    // original, or when it wins back lost points at little cost.
    const improvesWork =
      (analysis.score > work.score && dipPoints(analysis) <= 15) ||
      (dipPoints(analysis) < dipPoints(work) && analysis.score >= work.score - 2) ||
      (analysis.score === work.score && dipPoints(analysis) === dipPoints(work) && catSum(analysis) > catSum(work));
    if (improvesWork) {
      work = analysis;
      workText = draft.text;
      workChanges = [...new Set([...workChanges, ...draft.changes])];
      if (bestText === draft.text) changes = workChanges;
      tried = new Set();
      note = '';
    } else {
      if (dips.length) rejectedDrafts++;
      tried.add(focus);
      note = 'Your last edit was not an improvement and was discarded. Try a different change to this area.';
    }
  }

  // Every pass errored (provider outage): report that, rather than claiming the resume can't improve.
  // (A version already saved, e.g. from adding confirmed skills, is still returned.)
  if (failedPasses === attempts && bestText === originalText) throw new Error("The AI service is busy right now. Please try Boost again in a minute.");

  return {
    resumeText: bestText,
    analysis: best,
    changes: changes.slice(0, 12),
    attempts,
    reachedTarget: best.score >= TARGET_SCORE,
    improved: best.score > current.score,
    hasDraft: bestText !== originalText,
    blockers: forbidden.slice(0, 10),
    rejectedDrafts,
    regressed: [...regressed],
  };
}

/* ---------------- background jobs ---------------- */

// Jobs are stored in the database (OptimizeJob) so a restart or a second server instance
// doesn't lose them. The work itself still runs in the process that started it.

export interface OptimizeJobView {
  id: string;
  userId: string;
  scanId: string;
  status: 'running' | 'done' | 'failed';
  step: string;
  startedAt: number;
  resultScanId?: string;
  error?: string;
  blockers?: string[];
}

type JobRow = {
  id: string;
  userId: string;
  scanId: string;
  status: string;
  step: string;
  resultScanId: string | null;
  error: string | null;
  blockers: unknown;
  createdAt: Date;
};

const view = (j: JobRow): OptimizeJobView => ({
  id: j.id,
  userId: j.userId,
  scanId: j.scanId,
  status: j.status as OptimizeJobView['status'],
  step: j.step,
  startedAt: j.createdAt.getTime(),
  resultScanId: j.resultScanId ?? undefined,
  error: j.error ?? undefined,
  blockers: Array.isArray(j.blockers) ? (j.blockers as string[]) : undefined,
});

// A job still "running" after this long was orphaned (its process died mid-run).
const STALE_MS = 15 * 60 * 1000;

export async function createJob(job: { id: string; userId: string; scanId: string }) {
  return view(await prisma.optimizeJob.create({ data: { ...job, status: 'running', step: 'Starting' } }));
}

export async function updateJob(id: string, data: Partial<Pick<JobRow, 'status' | 'step' | 'resultScanId' | 'error'>> & { blockers?: string[] }) {
  await prisma.optimizeJob.update({ where: { id }, data: data as object }).catch((e: any) => console.error('job update failed:', e?.message));
}

export async function getJob(id: string) {
  const j = await prisma.optimizeJob.findUnique({ where: { id } });
  if (!j) return undefined;
  if (j.status === 'running' && Date.now() - j.updatedAt.getTime() > STALE_MS) {
    const failed = await prisma.optimizeJob.update({
      where: { id },
      data: { status: 'failed', error: 'This optimization stopped unexpectedly. Please run Boost again.' },
    });
    return view(failed);
  }
  return view(j);
}

export async function runningJobFor(userId: string, scanId: string) {
  const j = await prisma.optimizeJob.findFirst({
    where: { userId, scanId, status: 'running', updatedAt: { gt: new Date(Date.now() - STALE_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  return j ? view(j) : undefined;
}

/** On startup: anything still "running" belonged to the previous process and can't be resumed. */
export async function markInterruptedJobs() {
  const r = await prisma.optimizeJob.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', error: 'The server restarted while optimizing. Please run Boost again.' },
  });
  if (r.count) console.log(`  ↯ marked ${r.count} interrupted optimize job(s) as failed`);
  // Keep the table small: finished jobs older than a week are no longer polled.
  await prisma.optimizeJob.deleteMany({ where: { status: { not: 'running' }, updatedAt: { lt: new Date(Date.now() - 7 * 86400e3) } } });
}
