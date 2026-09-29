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
  meta?: string; // "Technologies: …" / "Tools: …" line under a project or role
  bullets: string[];
  /** Long roles: bullets grouped under short themed sub-headings (each bullet kept word for word). */
  groups?: { label: string; bullets: string[] }[];
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
  /** Page count chosen for this person's experience and content (1–3), with the reason. */
  layout?: { pages: 1 | 2 | 3; reason: string };
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
    // Without the AI's judgement, page count follows the amount of content.
    layout: { pages: text.length > 11000 ? 3 : text.length > 3500 ? 2 : 1, reason: 'Based on the amount of content' },
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
          meta: clean(e?.meta) || undefined,
          bullets: strs(e?.bullets),
          groups: (Array.isArray(e?.groups) ? e.groups : [])
            .map((g: any) => ({ label: clean(g?.label), bullets: strs(g?.bullets) }))
            .filter((g: { label: string; bullets: string[] }) => g.label && g.bullets.length),
          url: undefined as string | undefined,
        }))
        // Grouped bullets replace the flat list; a single group adds nothing, so it's flattened.
        .map((e: Entry) => {
          if (e.groups && e.groups.length >= 2) return { ...e, bullets: [] };
          const flat = e.groups?.length === 1 ? [...e.bullets, ...e.groups[0].bullets] : e.bullets;
          return { ...e, bullets: flat, groups: undefined };
        })
        .filter((e: Entry) => e.title || e.bullets.length || e.groups?.length);
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
    layout: pagesFrom(raw?.layout),
  };
}

function pagesFrom(raw: any): StructuredResume['layout'] {
  const n = Math.round(Number(raw?.pages));
  if (![1, 2, 3].includes(n)) return undefined;
  return { pages: n as 1 | 2 | 3, reason: clean(raw?.reason) };
}

export function flatten(r: StructuredResume) {
  const parts: string[] = [r.name, r.headline ?? '', r.tagline ?? '', ...r.contacts.map((c) => c.label)];
  for (const s of r.sections) {
    parts.push(s.title);
    if (s.type === 'text') parts.push(s.text);
    if (s.type === 'bullets') parts.push(...s.items);
    if (s.type === 'skills') for (const g of s.groups) parts.push(g.label, g.items);
    if (s.type === 'entries')
      for (const e of s.entries) {
        parts.push(e.title, e.org ?? '', e.location ?? '', e.dates ?? '', e.text ?? '', e.meta ?? '', ...e.bullets);
        for (const g of e.groups ?? []) parts.push(g.label, ...g.bullets);
      }
  }
  return parts.join('\n');
}

/** Share of the original's meaningful words that survived; low means the model dropped content.
 *  (Re-joined lines and dropped duplicate headings cost a few percent, hence the 85% bar.) */
function coverage(original: string, structured: string) {
  const have = new Set(words(structured));
  const src = words(original);
  return src.length ? src.filter((w) => have.has(w)).length / src.length : 1;
}

async function aiStructure(text: string, feedback = ''): Promise<StructuredResume> {
  const prompt = `Convert this resume into structured JSON for typesetting. You are ORGANIZING text, not writing it.

RULES:
- Keep every fact, number, name, date and link exactly as written. Do not add, remove, summarize or reword content.
- The text may have been extracted from a PDF: re-join lines that were broken mid-sentence, remove duplicate spaces, and separate job titles from dates that were glued together (e.g. "Engineer (SRE team)May 2025 - Apr 2026").
- Lines that were list items in the original become bullets, one sentence/idea per bullet.
- Put each certification, award or publication as its own entry with name as title, issuer as org and the date.
- Lines such as "Technologies: …", "Tech stack: …" or "Tools: …" under a project or role go in that entry's "meta", exactly as written.
- A role with more than 8 bullets: put its bullets in "groups" instead of "bullets": 2 to 5 groups with a short themed label (e.g. "Kubernetes & Platform", "Observability", "Cost & Security"), every bullet copied exactly and used once. Otherwise use "bullets".
- Use only the section titles from the resume; never create a new section (such as KEY ACHIEVEMENTS or HIGHLIGHTS) or repeat content in two places. ORDER the sections the way a recruiter expects for this person: summary first; then skills before experience for technical or early-career candidates (after experience for senior non-technical ones); then experience, projects, education, certifications, publications, awards, languages, interests.
- Decide the page count a recruiter would expect: "layout.pages" is 1 for under about 3 years of experience or little content, 2 for a typical mid-level or senior profile, 3 only for 12+ years, many publications or an academic CV. Give a one-line "layout.reason".

Return ONLY JSON:
{
  "name": "full name",
  "headline": "role / specialty line or empty",
  "tagline": "location / availability line or empty",
  "contacts": ["phone", "email", "linkedin url", "github url", "portfolio url"],
  "sections": [
    { "type": "text", "title": "PROFESSIONAL SUMMARY", "text": "paragraph" },
    { "type": "bullets", "title": "A LIST SECTION TITLE FROM THE RESUME", "items": ["..."] },
    { "type": "skills", "title": "TECHNICAL SKILLS", "groups": [{ "label": "Category", "items": "comma separated skills" }] },
    { "type": "entries", "title": "PROFESSIONAL EXPERIENCE", "entries": [{ "title": "Job title", "org": "Company", "location": "City, Country", "dates": "May 2025 - Apr 2026", "text": "optional one-line intro", "bullets": ["..."], "groups": [{ "label": "Theme", "bullets": ["..."] }] }] },
    { "type": "entries", "title": "PROJECTS", "entries": [{ "title": "Project name", "org": "", "dates": "", "meta": "Technologies: ...", "bullets": ["..."] }] },
    { "type": "entries", "title": "EDUCATION", "entries": [{ "title": "Degree", "org": "University", "location": "", "dates": "", "bullets": ["GPA / thesis / honors"] }] },
    { "type": "entries", "title": "CERTIFICATIONS", "entries": [{ "title": "Certificate name", "org": "Issuer", "dates": "2024", "bullets": [] }] }
  ],
  "layout": { "pages": 2, "reason": "one line" }
}

${feedback ? `FIX FROM YOUR PREVIOUS ATTEMPT:\n${feedback}\n\n` : ''}RESUME:
${text.slice(0, 14000)}`;

  // The JSON repeats the resume (~1 token per 3.2 chars) plus structure; the whole request must stay
  // under Groq's 8k tokens-per-minute budget per key or it's refused outright.
  const promptTokens = Math.ceil(prompt.length / 3.2);
  const maxTokens = Math.max(2500, Math.min(7600 - promptTokens, 1500 + Math.ceil(text.length / 2.6)));
  const response = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    ...({ reasoning_effort: 'low' } as object),
  });
  return normalize(JSON.parse(response.choices[0].message.content || '{}'));
}

export const textHash = (text: string) => crypto.createHash('sha1').update(text).digest('hex');

/** Bump when the structuring rules change: cached structures from older rules are rebuilt once. */
const STRUCTURE_VERSION = 3;
export const structureKey = (text: string) => `v${STRUCTURE_VERSION}:${textHash(text)}`;

/** Structure for export: AI first (verified), rule-based parser as the safe fallback. */
const words = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? [];
const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const FIELD_LABEL = /^(email|e-mail|phone|mobile|tel|location|address|linkedin|github|gitlab|portfolio|website|web)$/;

/**
 * Sections whose title isn't one of the resume's headings were made up (e.g. a "KEY ACHIEVEMENTS"
 * section of reworded experience bullets): they duplicate content, so they're removed. A title
 * passes if it is a heading of the resume, or contains every word of one ("SKILLS" may become
 * "TECHNICAL SKILLS"; "KEY ACHIEVEMENTS" matches no heading).
 */
function dropInventedSections(text: string, data: StructuredResume) {
  // Heading lines: short, and all caps, ending with a colon, or a common section name in any case.
  const SECTION_WORD = /^(professional |work |technical |core |key )?(summary|profile|objective|experience|employment|history|projects?|education|skills|competencies|certifications?|licenses|awards|honou?rs|achievements|publications|languages|interests|volunteering|leadership|activities|courses)\b/i;
  const headings = text
    .split('\n')
    .map((l) => l.trim().replace(/:$/, ''))
    .filter((l) => l && l.split(/\s+/).length <= 5 && /[a-z]/i.test(l) && (l === l.toUpperCase() || SECTION_WORD.test(l)))
    .map(normTitle)
    .filter(Boolean);
  if (!headings.length) return { data, dropped: [] as string[] };
  const kept = data.sections.filter((sec) => {
    const t = normTitle(sec.title);
    const tw = new Set(t.split(' '));
    // A title may extend a heading ("SKILLS" → "TECHNICAL SKILLS") or be one part of a combined
    // heading ("PUBLICATIONS, CERTIFICATIONS, AWARDS & LANGUAGES" → "AWARDS").
    return headings.some((h) => {
      const hw = h.split(' ');
      return h === t || hw.every((w) => tw.has(w)) || [...tw].every((w) => hw.includes(w));
    });
  });
  const dropped = data.sections.filter((sec) => !kept.includes(sec)).map((sec) => sec.title);
  return { data: { ...data, sections: kept }, dropped };
}

/**
 * Lines of the original (5+ words) whose words mostly vanished: the model dropped them. The word-level
 * coverage check alone let a whole line through (a publication title under an award).
 */
function lostLines(text: string, flat: string) {
  const have = new Set(words(flat));
  return text
    .split('\n')
    .map((l) => l.replace(/^[\s•*▪●◦-]+/, '').trim())
    .filter((l) => l.split(/\s+/).length >= 5)
    .filter((l) => {
      // Field labels ("Email:", "Phone:", "LinkedIn:") are rightly dropped when contacts are structured.
      const w = words(l).filter((x) => !FIELD_LABEL.test(x));
      return w.length >= 3 && w.filter((x) => have.has(x)).length / w.length < 0.6;
    });
}

export async function structureResume(text: string): Promise<{ data: StructuredResume; source: 'ai' | 'rules' }> {
  let feedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data, dropped } = dropInventedSections(text, await aiStructure(text, feedback));
      if (dropped.length) console.warn(`  ⚠ removed sections not in the resume: ${dropped.join(', ')}`);
      const flat = flatten(data);
      const invented = findUnsupported(text, flat, []);
      const kept = coverage(text, flat);
      const lost = lostLines(text, flat);
      if (data.name && data.sections.length && !invented.length && kept >= 0.85 && !lost.length) return { data, source: 'ai' };
      console.warn(
        `  ⚠ AI structure rejected (invented: ${invented.join(', ') || 'none'}, coverage ${(kept * 100).toFixed(0)}%, lost lines: ${lost.length})`,
      );
      feedback = [
        dropped.length ? `Do not create sections the resume doesn't have (you added: ${dropped.join(', ')}).` : '',
        lost.length ? `You left out these lines; include every one of them exactly as written:\n${lost.slice(0, 12).map((l) => '- ' + l).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } catch (e: any) {
      console.warn(`  ⚠ AI structure failed (attempt ${attempt}): ${String(e?.message).slice(0, 100)}`);
    }
  }
  return { data: fromRules(text), source: 'rules' };
}
