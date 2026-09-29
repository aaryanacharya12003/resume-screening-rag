// Finds experience/project bullets that describe work but never say what it achieved.
// These are where a real number from the candidate lifts the Impact score most, and the
// optimizer can only use numbers the candidate actually gives it.

const BULLET = /^\s*[-–•*▪‣●◦·]\s*/;
const WORK_HEADING = /experience|employment|work history|projects?|internships?|achievements/i;
/** "May 2025 - Apr 2026", "2022 – Present": marks a role/education line, not a bullet. */
const DATE_RANGE = /\b(19|20)\d{2}\s*[-–—]\s*([a-z]{3,9}\.?\s+)?((19|20)\d{2}|present|current|now)\b/i;

function isHeading(line: string) {
  const t = line.trim().replace(/:$/, '');
  if (!t || t.length > 40 || /[.,;]$/.test(t) || BULLET.test(line)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return (letters.length >= 3 && letters === letters.toUpperCase()) || /^(work |professional )?(experience|projects?|education|skills|summary|certifications?|employment history|internships?)$/i.test(t);
}

/** A result already there: a number, percentage, currency amount or scale word next to a number. */
const hasResult = (line: string) => /\d/.test(line.replace(/\b(19|20)\d{2}\b/g, ''));
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Text taken from a PDF breaks long bullets across lines, and bullet symbols drawn as images
 * disappear altogether. A line continues the one above when it starts in lower case, or when the
 * line above ran the full width of the page without ending a sentence (the last line of a bullet
 * is usually shorter). Headings, role/date lines and "a | b" lines never continue anything.
 */
function bulletBlocks(text: string) {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const lengths = lines.map((l) => tidy(l).length).filter((n) => n >= 40).sort((a, b) => a - b);
  const fullWidth = lengths.length ? lengths[Math.floor(lengths.length * 0.9)] : 100;

  const blocks: { heading?: string; text?: string; marked?: boolean }[] = [];
  let prevRaw = '';
  for (const raw of lines) {
    const t = tidy(raw.replace(BULLET, ''));
    const last = blocks[blocks.length - 1];
    const prev = tidy(prevRaw);
    const structural = !t || isHeading(raw) || t.includes('|') || DATE_RANGE.test(t);
    const continues =
      !!last?.text &&
      !structural &&
      !BULLET.test(raw) &&
      (/^[a-z(]/.test(t) || (!/[.!?)"”]$/.test(prev) && prev.length >= fullWidth * 0.8));
    if (continues) last!.text = `${last!.text} ${t}`;
    else if (isHeading(raw)) blocks.push({ heading: raw });
    else if (t) blocks.push({ text: t, marked: BULLET.test(raw) });
    prevRaw = raw;
  }
  return blocks;
}

export function findResultGaps(text: string, max = 8): string[] {
  const blocks = bulletBlocks(text);
  const hasHeadings = blocks.some((b) => b.heading);
  let inWork = !hasHeadings;
  const out: string[] = [];
  for (const b of blocks) {
    if (b.heading) {
      inWork = WORK_HEADING.test(b.heading);
      continue;
    }
    if (!inWork || !b.text) continue;
    const line = b.text;
    const words = line.split(/\s+/).length;
    // Role/company/date lines ("Engineer | Acme | 2021 – Present") are not bullets.
    if (line.includes('|') || DATE_RANGE.test(line)) continue;
    if (!b.marked && words < 8) continue;
    // "Technologies: Node.js, …" and similar labelled lists name tools, not work.
    if (/^(tech(nologies|nology| stack)?|tools|stack|skills|environment)\s*:/i.test(line)) continue;
    if (words < 6 || hasResult(line)) continue;
    if (!out.includes(line)) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
