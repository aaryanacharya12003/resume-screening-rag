// Finds experience/project bullets that describe work but never say what it achieved.
// These are where a real number from the candidate lifts the Impact score most, and the
// optimizer can only use numbers the candidate actually gives it.

const BULLET = /^\s*[-–•*▪‣●◦·]\s+/;
const WORK_HEADING = /experience|employment|work history|projects?|internships?|achievements/i;

function isHeading(line: string) {
  const t = line.trim().replace(/:$/, '');
  if (!t || t.length > 40 || /[.,;]$/.test(t) || BULLET.test(line)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return (letters.length >= 3 && letters === letters.toUpperCase()) || /^(work |professional )?(experience|projects?|education|skills|summary|certifications?|employment history|internships?)$/i.test(t);
}

/** A result already there: a number, percentage, currency amount or scale word next to a number. */
const hasResult = (line: string) => /\d/.test(line.replace(/\b(19|20)\d{2}\b/g, ''));

export function findResultGaps(text: string, max = 8): string[] {
  const lines = text.split('\n');
  const hasHeadings = lines.some(isHeading);
  let inWork = !hasHeadings;
  const out: string[] = [];
  for (const raw of lines) {
    if (isHeading(raw)) {
      inWork = WORK_HEADING.test(raw);
      continue;
    }
    if (!inWork) continue;
    const isBullet = BULLET.test(raw);
    const line = raw.replace(BULLET, '').trim();
    const words = line.split(/\s+/).length;
    // Role/company/date lines ("Engineer | Acme | 2021 – Present") are not bullets.
    if (!isBullet && (words < 8 || line.includes('|'))) continue;
    // "Technologies: Node.js, …" and similar labelled lists name tools, not work.
    if (/^(tech(nologies|nology| stack)?|tools|stack|skills|environment)\s*:/i.test(line)) continue;
    if (words < 6 || hasResult(line)) continue;
    if (!out.includes(line)) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
