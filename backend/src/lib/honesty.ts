// Checks that AI-written resume text only claims what the original resume supports.

export const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, '-');
export const stripPlaceholders = (s: string) => s.replace(/\[[^\]]*\]/g, ' ');

/** Technical-looking tokens of a skill phrase: "AWS EC2" → [AWS, EC2]; ignores plain words like "production". */
function techTokens(term: string) {
  return term
    .split(/[\s,;()]+/)
    .map((t) => t.replace(/^[^\w#+.]+|[^\w#+]+$/g, ''))
    .filter((t) => t.length >= 2 && /[A-Z0-9#+./]/.test(t) && !/^\d+$/.test(t));
}

function containsToken(text: string, token: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${norm(escaped)}($|[^a-z0-9])`, 'i').test(norm(text));
}

/** Numbers that carry a claim (percentages, counts, money); years and dates are ignored. */
function claimNumbers(text: string) {
  const out = new Set<string>();
  for (const m of stripPlaceholders(text).matchAll(/(\d[\d,.]*)\s*(%|\+|k\b|m\b|x\b|cr\b|lakh)?/gi)) {
    const n = m[1].replace(/,/g, '').replace(/\.$/, '');
    if (/^(19|20)\d{2}$/.test(n)) continue;
    out.add(n);
  }
  return out;
}

/** Everything a draft claims that the original resume doesn't support. */
export function findUnsupported(original: string, draft: string, terms: string[]) {
  const problems = new Set<string>();
  const body = stripPlaceholders(draft);
  for (const term of terms) {
    for (const tok of techTokens(term)) {
      if (containsToken(body, tok) && !containsToken(original, tok)) problems.add(tok);
    }
  }
  const origNums = claimNumbers(original);
  for (const n of claimNumbers(draft)) if (!origNums.has(n)) problems.add(`the number "${n}"`);
  return [...problems];
}

/** Replaces numbers the original doesn't contain with [X…] so suggestions never invent metrics. */
export function placeholderizeNumbers(original: string, text: string) {
  const known = claimNumbers(original);
  // Leave existing [placeholders] alone; only rewrite numbers in the surrounding text.
  return text
    .split(/(\[[^\]]*\])/g)
    .map((part) =>
      part.startsWith('[')
        ? part
        : part.replace(/(\d[\d,.]*\d|\d)(\s*(?:%|\+|k\b|m\b|x\b|cr\b|lakh|ms\b|s\b))?/gi, (match, num: string, unit = '') => {
            const n = num.replace(/,/g, '');
            if (/^(19|20)\d{2}$/.test(n) || known.has(n)) return match;
            return `[X${unit.trim()}]`;
          }),
    )
    .join('');
}

/* ---------------- content retention ---------------- */

const HEADING_LINE = /^[^a-z]{3,}$/; // all-caps lines (section headings, labels) aren't facts

/** Normalized "fact" tokens: anything with a digit, an inner capital (GitHub, CentOS) or all caps (AWS, RHEL). */
function factTokens(text: string) {
  const body = text
    .split('\n')
    .filter((l) => !HEADING_LINE.test(l.trim()))
    .join('\n')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/×/g, 'x')
    // PDF extraction glues dates onto the previous word ("InternJan", "8.05/10Jul"); split them back.
    .replace(/([a-z0-9])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=[a-z]*\b)/g, '$1 $2');
  const out = new Set<string>();
  for (const raw of body.match(/[A-Za-z0-9][\w+#./-]*/g) ?? []) {
    const w = raw.replace(/[.,;:/-]+$/, '');
    if (w.length < 2) continue;
    if (/\d/.test(w) || /[a-z][A-Z]/.test(w) || /^[A-Z]{2,}[\w+#-]*$/.test(w)) out.add(w.toLowerCase());
  }
  return out;
}

/**
 * Facts from the original that a rewrite dropped (tools, versions, numbers, acronyms), plus how much
 * shorter it got. Rewording is fine; losing "RHEL" or "kernel 3.10 → 5.14" is not.
 */
export function contentLoss(original: string, draft: string) {
  const before = factTokens(original);
  const after = factTokens(draft);
  const flat = draft.toLowerCase().replace(/[\u2010-\u2015]/g, '-');
  const lost = [...before].filter((w) => !after.has(w) && !flat.includes(w));
  return {
    lost,
    retention: before.size ? (before.size - lost.length) / before.size : 1,
    lengthRatio: original.length ? draft.length / original.length : 1,
  };
}

const SKILL_HEADING = /^\s*(technical\s+)?skills?\b|^\s*core\s+competenc|^\s*technologies\s*$|^\s*tech\s+stack/i;
const ANY_HEADING = /^\s*[A-Z][A-Z &/]{2,40}:?\s*$/;
const FILLER = new Set(['and', 'with', 'the', 'for', 'of', 'in', 'on', 'using', 'tools', 'basics', 'basic', 'advanced', 'etc']);

/** Items listed in the SKILLS section(s), without their "Category:" labels. */
function skillItems(text: string) {
  const items: string[] = [];
  let inSkills = false;
  for (const line of text.split('\n')) {
    if (SKILL_HEADING.test(line)) {
      inSkills = true;
      const rest = line.replace(SKILL_HEADING, '').replace(/^[^:]*:/, '');
      if (rest.trim()) items.push(...rest.split(/[,;|•()]+/));
      continue;
    }
    if (ANY_HEADING.test(line)) inSkills = false;
    if (!inSkills) continue;
    const body = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    items.push(...body.split(/[,;|•()]+/));
  }
  return items.map((i) => i.replace(/^[\s\-–*]+|[\s.]+$/g, '').trim()).filter((i) => i.length >= 2);
}

/**
 * Skills a draft lists that the original never mentions, e.g. "container orchestration" added next
 * to Docker. Catches padding the keyword list can't: every meaningful word of a new SKILLS item must
 * already appear somewhere in the original (or in what the candidate confirmed).
 */
export function findNewSkillItems(original: string, draft: string) {
  const orig = norm(original);
  const out: string[] = [];
  for (const item of skillItems(draft)) {
    if (orig.includes(norm(item))) continue;
    const words = norm(item)
      .split(/[^a-z0-9#+.]+/)
      .filter((w) => w.length >= 3 && !FILLER.has(w));
    const missing = words.filter((w) => !containsToken(original, w));
    if (missing.length) out.push(item);
  }
  return [...new Set(out)];
}

/**
 * Adds skills the candidate confirmed to the SKILLS section, changing nothing else, so no other
 * part of the resume can get worse. Skills the text already mentions are skipped. Without a
 * SKILLS section, one is added at the end.
 */
export function insertSkills(text: string, skills: string[]) {
  const add = [...new Set(skills.map((s) => s.trim()).filter(Boolean))].filter((s) => !containsToken(text, s));
  if (!add.length) return text;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => SKILL_HEADING.test(l));
  if (start < 0) return `${text.replace(/\s+$/, '')}\n\nSKILLS\n${add.join(', ')}\n`;
  // The section runs until the next heading; the new line goes after its last non-empty line.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (ANY_HEADING.test(lines[i]) && !SKILL_HEADING.test(lines[i])) {
      end = i;
      break;
    }
  }
  let last = start;
  for (let i = start + 1; i < end; i++) if (lines[i].trim()) last = i;
  // Match the section's style: "Category: a, b" lines get an "Additional:" line, plain lists get a plain line.
  const labelled = lines.slice(start + 1, end).some((l) => /^[\w &/+.-]{2,30}:\s*\S/.test(l.trim()));
  const bullet = lines[last].match(/^\s*([-•*▪]\s+)/)?.[1] ?? '';
  lines.splice(last + 1, 0, `${bullet}${labelled ? 'Additional: ' : ''}${add.join(', ')}`);
  return lines.join('\n');
}
