// AI-assisted resume structuring for PDF/Word export. The model only *organizes* the text
// (re-joins hard-wrapped lines, splits titles from dates, groups certifications…); code then
// checks it didn't invent numbers or drop content, and falls back to the rule-based parser if it did.
import crypto from 'crypto';
import { groq, GROQ_CHAT_MODEL } from '../config/groq';
import { findUnsupported } from './honesty';
import { contactItems, parseResume } from './resumeFormat';

export interface Contact {
  label: string;
  url?: string;
}

export interface Entry {
  title: string; // role, degree or project name
  org?: string; // company, school, issuer
  location?: string;
  dates?: string;
  url?: string;
  text?: string; // short intro line under the entry
  bullets: string[];
}

export type StructuredSection =
  | { type: 'text'; title: string; text: string }
  | { type: 'bullets'; title: string; items: string[] }
  | { type: 'skills'; title: string; groups: { label: string; items: string }[] }
  | { type: 'entries'; title: string; entries: Entry[] };

export interface StructuredResume {
  name: string;
  headline?: string;
  tagline?: string; // location / availability line
  contacts: Contact[];
  sections: StructuredSection[];
}

/* ---------------- links (derived in code, never trusted from the model) ---------------- */

export function linkFor(label: string): string | undefined {
  const t = label.trim();
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return `mailto:${t}`;
  if (/^\+?[\d\s()-]{8,}$/.test(t)) return `tel:${t.replace(/[^\d+]/g, '')}`;
  const url = t.match(/(https?:\/\/)?((www\.)?[\w-]+(\.[\w-]+)+(\/[^\s,;]*)?)/i);
  if (url && /\.(com|in|io|dev|me|org|net|ai|co|app|xyz|tech|site|page)\b|linkedin|github|gitlab|behance|medium/i.test(url[2])) {
    return url[1] ? url[0] : `https://${url[2]}`;
  }
  return undefined;
}

/** Shown text for a contact: "https://www.linkedin.com/in/x/" → "linkedin.com/in/x" (the link itself stays full). */
export const displayLabel = (label: string) =>
  label
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/\/$/, '');

/* ---------------- rule-based fallback ---------------- */

export function fromRules(text: string): StructuredResume {
  const d = parseResume(text);
  const sections: StructuredSection[] = d.sections.map((s) => {
    if (s.blocks.every((b) => b.kind === 'skill')) {
      return { type: 'skills', title: s.title, groups: s.blocks.map((b) => (b.kind === 'skill' ? { label: b.label, items: b.text } : { label: '', items: '' })) };
    }
    if (s.blocks.some((b) => b.kind === 'entry')) {
      const entries: Entry[] = [];
      for (const b of s.blocks) {
        if (b.kind === 'entry') entries.push({ title: b.title, org: b.subtitle, dates: b.meta, bullets: [] });
        else if (!entries.length) entries.push({ title: '', bullets: [] });
        const e = entries[entries.length - 1];
        if (b.kind === 'bullet') e.bullets.push(b.text);
        else if (b.kind === 'para' || b.kind === 'skill') e.text = [e.text, b.kind === 'para' ? b.text : `${b.label}: ${b.text}`].filter(Boolean).join(' ');
      }
      return { type: 'entries', title: s.title, entries };
    }
    if (s.blocks.every((b) => b.kind === 'bullet')) return { type: 'bullets', title: s.title, items: s.blocks.map((b) => (b.kind === 'bullet' ? b.text : '')) };
    const lineOf = (b: (typeof s.blocks)[number]) =>
      b.kind === 'skill' ? `${b.label}: ${b.text}` : b.kind === 'entry' ? [b.title, b.subtitle, b.meta].filter(Boolean).join(' ') : b.text;
    return { type: 'text', title: s.title, text: s.blocks.map(lineOf).join(' ') };
  });
  return {
    name: d.name,
    headline: d.headline[0],
    tagline: d.headline.slice(1).join('  |  ') || undefined,
    contacts: contactItems(d).map((label) => ({ label: displayLabel(label), url: linkFor(label) })),
    sections,
  };
}

/* ---------------- AI structuring ---------------- */

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

function normalize(raw: any): StructuredResume {
  const sections: StructuredSection[] = [];
  for (const s of Array.isArray(raw?.sections) ? raw.sections : []) {
    const title = clean(s?.title).toUpperCase();
    if (!title) continue;
    if (s.type === 'skills') {
      const groups = (Array.isArray(s.groups) ? s.groups : []).map((g: any) => ({ label: clean(g?.label), items: clean(g?.items) })).filter((g: any) => g.items);
      if (groups.length) sections.push({ type: 'skills', title, groups });
    } else if (s.type === 'entries') {
      const entries = (Array.isArray(s.entries) ? s.entries : [])
        .map((e: any) => ({
          title: clean(e?.title),
          org: clean(e?.org) || undefined,
          location: clean(e?.location) || undefined,
          dates: clean(e?.dates) || undefined,
          text: clean(e?.text) || undefined,
          bullets: strs(e?.bullets),
          url: undefined as string | undefined,
        }))
        .filter((e: Entry) => e.title || e.bullets.length);
      for (const e of entries) {
        const u = [e.title, e.org, e.text].map((x) => (x ? linkFor(x.match(/\S+\.\S+\/\S+|github\.com\/\S+/i)?.[0] ?? '') : undefined)).find(Boolean);
        if (u) e.url = u;
      }
      if (entries.length) sections.push({ type: 'entries', title, entries });
    } else if (s.type === 'bullets') {
      const items = strs(s.items);
      if (items.length) sections.push({ type: 'bullets', title, items });
    } else {
      const text = clean(s.text);
      if (text) sections.push({ type: 'text', title, text });
    }
  }
  return {
    name: clean(raw?.name),
    headline: clean(raw?.headline) || undefined,
    tagline: clean(raw?.tagline) || undefined,
    contacts: strs(raw?.contacts).map((label) => ({ label: displayLabel(label), url: linkFor(label) })),
    sections,
  };
}

export function flatten(r: StructuredResume) {
  const parts: string[] = [r.name, r.headline ?? '', r.tagline ?? '', ...r.contacts.map((c) => c.label)];
  for (const s of r.sections) {
    parts.push(s.title);
    if (s.type === 'text') parts.push(s.text);
    if (s.type === 'bullets') parts.push(...s.items);
    if (s.type === 'skills') for (const g of s.groups) parts.push(g.label, g.items);
    if (s.type === 'entries') for (const e of s.entries) parts.push(e.title, e.org ?? '', e.location ?? '', e.dates ?? '', e.text ?? '', ...e.bullets);
  }
  return parts.join('\n');
}

/** Share of the original's meaningful words that survived; low means the model dropped content.
 *  (Re-joined lines and dropped duplicate headings cost a few percent, hence the 85% bar.) */
function coverage(original: string, structured: string) {
  const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []);
  const have = new Set(words(structured));
  const src = words(original);
  return src.length ? src.filter((w) => have.has(w)).length / src.length : 1;
}

async function aiStructure(text: string): Promise<StructuredResume> {
  const prompt = `Convert this resume into structured JSON for typesetting. You are ORGANIZING text, not writing it.

RULES:
- Keep every fact, number, name, date and link exactly as written. Do not add, remove, summarize or reword content.
- The text may have been extracted from a PDF: re-join lines that were broken mid-sentence, remove duplicate spaces, and separate job titles from dates that were glued together (e.g. "Engineer (SRE team)May 2025 - Apr 2026").
- Lines that were list items in the original become bullets, one sentence/idea per bullet.
- Put each certification, award or publication as its own entry with name as title, issuer as org and the date.
- Use the section titles from the resume.

Return ONLY JSON:
{
  "name": "full name",
  "headline": "role / specialty line or empty",
  "tagline": "location / availability line or empty",
  "contacts": ["phone", "email", "linkedin url", "github url", "portfolio url"],
  "sections": [
    { "type": "text", "title": "PROFESSIONAL SUMMARY", "text": "paragraph" },
    { "type": "bullets", "title": "KEY ACHIEVEMENTS", "items": ["..."] },
    { "type": "skills", "title": "TECHNICAL SKILLS", "groups": [{ "label": "Category", "items": "comma separated skills" }] },
    { "type": "entries", "title": "PROFESSIONAL EXPERIENCE", "entries": [{ "title": "Job title", "org": "Company", "location": "City, Country", "dates": "May 2025 - Apr 2026", "text": "optional one-line intro", "bullets": ["..."] }] },
    { "type": "entries", "title": "EDUCATION", "entries": [{ "title": "Degree", "org": "University", "location": "", "dates": "", "bullets": ["GPA / thesis / honors"] }] },
    { "type": "entries", "title": "CERTIFICATIONS", "entries": [{ "title": "Certificate name", "org": "Issuer", "dates": "2024", "bullets": [] }] }
  ]
}

RESUME:
${text.slice(0, 14000)}`;

  const response = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 7000,
    response_format: { type: 'json_object' },
    ...({ reasoning_effort: 'low' } as object),
  });
  return normalize(JSON.parse(response.choices[0].message.content || '{}'));
}

export const textHash = (text: string) => crypto.createHash('sha1').update(text).digest('hex');

/** Structure for export: AI first (verified), rule-based parser as the safe fallback. */
export async function structureResume(text: string): Promise<{ data: StructuredResume; source: 'ai' | 'rules' }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await aiStructure(text);
      const flat = flatten(data);
      const invented = findUnsupported(text, flat, []);
      const kept = coverage(text, flat);
      if (data.name && data.sections.length && !invented.length && kept >= 0.85) return { data, source: 'ai' };
      console.warn(`  ⚠ AI structure rejected (invented: ${invented.join(', ') || 'none'}, coverage ${(kept * 100).toFixed(0)}%)`);
    } catch (e: any) {
      console.warn(`  ⚠ AI structure failed (attempt ${attempt}): ${String(e?.message).slice(0, 100)}`);
    }
  }
  return { data: fromRules(text), source: 'rules' };
}
