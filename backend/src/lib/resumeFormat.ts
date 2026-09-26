// Turns plain resume text (as written by the optimizer or edited by the user) into a structure
// that the PDF and Word exporters can lay out properly.

export type Block =
  | { kind: 'entry'; title: string; subtitle?: string; meta?: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'skill'; label: string; text: string }
  | { kind: 'para'; text: string };

export interface Section {
  title: string;
  blocks: Block[];
}

export interface ResumeDoc {
  name: string;
  headline: string[];
  contact: string[];
  sections: Section[];
}

const KNOWN_SECTIONS =
  /^(professional\s+)?(summary|profile|objective|about|experience|work experience|employment|education|skills|technical skills|core skills|projects|certifications?|achievements|awards|publications|languages|interests|volunteering|training|courses)$/i;
const BULLET = /^\s*[•\-*▪●◦–]\s+/;
const DATE_LIKE = /((19|20)\d{2})|\bpresent\b|\bcurrent\b/i;
const CONTACT_LIKE = /@|\+?\d[\d\s()-]{7,}|linkedin|github|https?:\/\/|www\./i;
const CONTACT_LABEL = /^(e-?mail|phone|mobile|tel|location|address|linkedin|github|portfolio|website)\s*:\s*/i;

function isHeading(line: string) {
  const t = line.replace(/:$/, '').trim();
  if (!t || t.length > 40 || BULLET.test(line)) return false;
  if (KNOWN_SECTIONS.test(t)) return true;
  // "GPA: 3.7/4.0", "AWS (2022)": labels with values or numbers are content, not headings.
  if (t.includes(':') || /\d/.test(t) || t.includes('|')) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function parseEntry(line: string): Block | null {
  const parts = line.split(/\s+\|\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const dateIdx = parts.findIndex((p, i) => i > 0 && DATE_LIKE.test(p));
  const meta = dateIdx >= 0 ? parts.splice(dateIdx, 1)[0] : undefined;
  const [title, ...rest] = parts;
  return { kind: 'entry', title, subtitle: rest.length ? rest.join(' · ') : undefined, meta };
}

export function parseResume(text: string): ResumeDoc {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const doc: ResumeDoc = { name: '', headline: [], contact: [], sections: [] };
  let current: Section | null = null;

  for (const line of lines) {
    if (!line) continue;

    // The first line is always the candidate's name, even when it's written in capitals.
    if (!doc.name && !current) {
      doc.name = line;
      continue;
    }

    if (isHeading(line)) {
      current = { title: line.replace(/:$/, '').trim().toUpperCase(), blocks: [] };
      doc.sections.push(current);
      continue;
    }

    if (!current) {
      if (CONTACT_LIKE.test(line)) doc.contact.push(line);
      else doc.headline.push(line);
      continue;
    }

    if (BULLET.test(line)) {
      current.blocks.push({ kind: 'bullet', text: line.replace(BULLET, '') });
      continue;
    }

    const entry = line.includes(' | ') ? parseEntry(line) : null;
    if (entry && entry.kind === 'entry') {
      // Education often reads "Degree" then "School | Years": merge into one entry.
      const prev = current.blocks[current.blocks.length - 1];
      if (!entry.subtitle && prev?.kind === 'para' && /educat/i.test(current.title)) {
        current.blocks[current.blocks.length - 1] = { kind: 'entry', title: prev.text, subtitle: entry.title, meta: entry.meta };
      } else {
        current.blocks.push(entry);
      }
      continue;
    }

    const skill = /skill|competenc|technolog/i.test(current.title) ? line.match(/^([^:]{2,40}):\s*(.+)$/) : null;
    if (skill) {
      current.blocks.push({ kind: 'skill', label: skill[1].trim(), text: skill[2].trim() });
      continue;
    }
    current.blocks.push({ kind: 'para', text: line });
  }

  // A short line that introduces bullets (e.g. a project name) reads as a title, not body text.
  for (const s of doc.sections) {
    if (/summary|profile|objective|about/i.test(s.title)) continue;
    s.blocks = s.blocks.map((b, i) => {
      const next = s.blocks[i + 1];
      return b.kind === 'para' && next?.kind === 'bullet' && b.text.length <= 90 && !/[.!?]$/.test(b.text)
        ? { kind: 'entry', title: b.text }
        : b;
    });
  }

  return doc;
}

/** Contact lines flattened into clean items ("Email: a@b.com | Phone: …" → ["a@b.com", "…"]). */
export function contactItems(doc: ResumeDoc) {
  return doc.contact
    .flatMap((l) => l.split(/\s+[|•·]\s+/))
    .map((s) => s.replace(CONTACT_LABEL, '').trim())
    .filter(Boolean);
}
