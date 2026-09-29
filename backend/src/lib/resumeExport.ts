import PDFDocument from 'pdfkit';
// pdfkit loads its built-in fonts at runtime through package "imports" (#standard-fonts/...),
// which Vercel's file tracer doesn't follow, so the deployed function had no font files and every
// PDF export failed. Importing the fonts the templates use by their public paths makes the tracer ship them.
import 'pdfkit/standard-fonts/Helvetica';
import 'pdfkit/standard-fonts/HelveticaBold';
import 'pdfkit/standard-fonts/HelveticaOblique';
import 'pdfkit/standard-fonts/TimesRoman';
import 'pdfkit/standard-fonts/TimesBold';
import 'pdfkit/standard-fonts/TimesItalic';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import { Contact, Entry, StructuredResume } from './resumeStructure';

/* ================= templates ================= */

// Every template is one column with real text (no tables, images or text boxes), so ATS parsing
// is identical across them; they differ in type, colour, header and density.
export type TemplateId = 'classic' | 'modern' | 'minimal' | 'compact' | 'executive';

interface Template {
  id: TemplateId;
  name: string;
  description: string;
  pdf: { regular: string; bold: string; italic: string; heading: string };
  docxFont: string;
  docxHeadingFont: string;
  ink: string;
  accent: string;
  muted: string;
  rule: string;
  header: 'left' | 'center';
  /** How section titles look: light rule under, coloured bar before, or a strong full-width rule. */
  heading: 'rule' | 'bar' | 'strong-rule';
  bulletChar: string;
  nameColor: 'ink' | 'accent';
  /** Base sizes in points (before fitting). */
  size: { name: number; body: number; heading: number };
  /** Vertical spacing multiplier: below 1 is denser. */
  spacing: number;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Clean sans-serif with indigo accents. Works for any role.',
    pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', heading: 'Helvetica-Bold' },
    docxFont: 'Calibri',
    docxHeadingFont: 'Calibri',
    ink: '#1C1B3F',
    accent: '#2F2A8C',
    muted: '#5A5D7E',
    rule: '#DFE3F1',
    header: 'left',
    heading: 'rule',
    bulletChar: '•',
    nameColor: 'ink',
    size: { name: 21, body: 9.8, heading: 10.2 },
    spacing: 1,
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Teal accent bar and a coloured name. Suits tech and product roles.',
    pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', heading: 'Helvetica-Bold' },
    docxFont: 'Calibri',
    docxHeadingFont: 'Calibri',
    ink: '#16212B',
    accent: '#0F766E',
    muted: '#51606B',
    rule: '#D5E6E3',
    header: 'left',
    heading: 'bar',
    bulletChar: '•',
    nameColor: 'accent',
    size: { name: 23, body: 9.8, heading: 10.5 },
    spacing: 1.05,
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Black and grey serif, centred header. Quiet and traditional.',
    pdf: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', heading: 'Times-Bold' },
    docxFont: 'Georgia',
    docxHeadingFont: 'Georgia',
    ink: '#111111',
    accent: '#111111',
    muted: '#555555',
    rule: '#111111',
    header: 'center',
    heading: 'strong-rule',
    bulletChar: '–',
    nameColor: 'ink',
    size: { name: 22, body: 10.6, heading: 10.8 },
    spacing: 1,
  },
  compact: {
    id: 'compact',
    name: 'Compact',
    description: 'Dense slate layout that fits more on each page.',
    pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', heading: 'Helvetica-Bold' },
    docxFont: 'Arial',
    docxHeadingFont: 'Arial',
    ink: '#1E293B',
    accent: '#334155',
    muted: '#64748B',
    rule: '#CBD5E1',
    header: 'left',
    heading: 'rule',
    bulletChar: '•',
    nameColor: 'ink',
    size: { name: 18, body: 9.2, heading: 9.6 },
    spacing: 0.82,
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Navy serif headings, centred header. For senior and leadership roles.',
    pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', heading: 'Times-Bold' },
    docxFont: 'Calibri',
    docxHeadingFont: 'Cambria',
    ink: '#1B2433',
    accent: '#1E3A5F',
    muted: '#5B6577',
    rule: '#1E3A5F',
    header: 'center',
    heading: 'strong-rule',
    bulletChar: '•',
    nameColor: 'accent',
    size: { name: 23, body: 9.9, heading: 11 },
    spacing: 1.05,
  },
};

export const templateList = () => Object.values(TEMPLATES).map(({ id, name, description }) => ({ id, name, description }));
export const isTemplateId = (v: unknown): v is TemplateId => typeof v === 'string' && v in TEMPLATES;

/* ================= PDF ================= */

// PDF standard fonts only cover Windows-1252; map common characters outside it so nothing prints as garbage.
function safe(s: string) {
  return s
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/\s*[→⟶➔]\s*/g, ' -> ')
    .replace(/\s*←\s*/g, ' <- ')
    .replace(/≈/g, '~')
    .replace(/[✓✔]\s*/g, '')
    .replace(/[‐‑‒−]/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/[▪●◦]/g, '•')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\xFF‘’“”•–—…€™]/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

const entryMeta = (e: Entry) => [e.org, e.location].filter(Boolean).join(' · ');
const hasBody = (e: Entry) => e.bullets.length > 0 || !!e.groups?.length || !!e.text || !!e.meta;
/** Short entries (certifications, awards) fit on one line: "Name — Issuer ........ 2024". */
const isCompact = (e: Entry) => !hasBody(e) && e.title.length + (e.org?.length ?? 0) < 95;

function renderPdf(r: StructuredResume, t: Template, scale: number): Promise<{ buffer: Buffer; pages: number }> {
  const k = (n: number) => n * scale;
  const sp = (n: number) => n * scale * t.spacing;
  const margin = Math.round((t.spacing < 1 ? 34 : 40) + 8 * scale);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: margin - 4, bottom: margin - 6, left: margin + 4, right: margin + 4 },
    bufferPages: true,
    info: { Title: `${r.name} - Resume`, Author: r.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const F = t.pdf;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const body = k(t.size.body);
  const gap = k(1.2) * t.spacing;
  const align = t.header === 'center' ? 'center' : 'left';
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensureRoom = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  const bullet = (text: string, indent = 0) => {
    ensureRoom(body * 1.4);
    const y0 = doc.y;
    doc.font(F.regular).fontSize(body).fillColor(t.accent).text(t.bulletChar, left + indent + 3, y0, { width: 8 });
    doc.font(F.regular).fontSize(body).fillColor(t.ink).text(safe(text), left + indent + 13, y0, { width: width - indent - 13, lineGap: gap });
    doc.moveDown(sp(0.14));
  };

  // Header
  doc.font(F.heading).fontSize(k(t.size.name)).fillColor(t.nameColor === 'accent' ? t.accent : t.ink).text(safe(r.name || 'Resume'), left, doc.y, { width, align });
  if (r.headline) doc.moveDown(sp(0.12)).font(F.regular).fontSize(k(11)).fillColor(t.accent).text(safe(r.headline), { width, align });
  if (r.tagline) doc.moveDown(sp(0.08)).font(F.regular).fontSize(k(9.8)).fillColor(t.muted).text(safe(r.tagline), { width, align });
  if (r.contacts.length) {
    doc.moveDown(sp(0.2)).font(F.regular).fontSize(k(9.3));
    const sep = '   •   ';
    if (align === 'center') {
      // Centred contact line: pdfkit can't centre a run of linked fragments, so it's drawn as one line.
      doc.fillColor(t.muted).text(r.contacts.map((c) => safe(c.label)).join(sep), left, doc.y, { width, align: 'center' });
    } else {
      r.contacts.forEach((c: Contact, i) => {
        const last = i === r.contacts.length - 1;
        doc.fillColor(c.url ? t.accent : t.muted).text(safe(c.label), { continued: !last, link: c.url, underline: false });
        if (!last) doc.fillColor(t.muted).text(sep, { continued: true, link: undefined });
      });
    }
  }
  if (t.heading === 'strong-rule') {
    const y = doc.y + sp(4);
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.2).strokeColor(t.rule).stroke();
    doc.y = y + sp(2);
  }

  const sectionTitle = (title: string) => {
    ensureRoom(k(46));
    doc.moveDown(sp(0.75));
    if (t.heading === 'bar') {
      const y = doc.y;
      doc.rect(left, y + 1, 3.2, k(t.size.heading)).fill(t.accent);
      doc.font(F.heading).fontSize(k(t.size.heading)).fillColor(t.accent).text(safe(title), left + 9, y, { width: width - 9, characterSpacing: 1 });
      doc.y += sp(3);
      return;
    }
    doc.font(F.heading).fontSize(k(t.size.heading)).fillColor(t.accent).text(safe(title), left, doc.y, { width, characterSpacing: 1 });
    const ruleY = doc.y + 1.5;
    doc.moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(t.heading === 'strong-rule' ? 0.9 : 0.7).strokeColor(t.rule).stroke();
    doc.y = ruleY + sp(5);
  };

  for (const s of r.sections) {
    sectionTitle(s.title);
    if (s.type === 'text') {
      doc.font(F.regular).fontSize(body).fillColor(t.ink).text(safe(s.text), left, doc.y, { width, lineGap: gap, align: 'left' });
    } else if (s.type === 'bullets') {
      s.items.forEach((x) => bullet(x));
    } else if (s.type === 'skills') {
      for (const g of s.groups) {
        ensureRoom(body * 1.4);
        if (g.label) {
          doc.font(F.bold).fontSize(body).fillColor(t.ink).text(`${safe(g.label)}: `, left, doc.y, { width, continued: true, lineGap: gap });
          doc.font(F.regular).fillColor(t.ink).text(safe(g.items), { lineGap: gap });
        } else {
          doc.font(F.regular).fontSize(body).fillColor(t.ink).text(safe(g.items), left, doc.y, { width, lineGap: gap });
        }
        doc.moveDown(sp(0.12));
      }
    } else {
      s.entries.forEach((e, idx) => {
        ensureRoom(k(isCompact(e) ? 16 : 34));
        if (idx > 0) doc.moveDown(sp(isCompact(e) ? 0.1 : 0.4));
        const y0 = doc.y;
        const dateW = e.dates ? Math.min(width * 0.32, doc.font(F.regular).fontSize(k(9.3)).widthOfString(safe(e.dates)) + 6) : 0;
        const titleW = width - dateW - 8;
        if (isCompact(e)) {
          doc.font(F.bold).fontSize(body).fillColor(t.ink).text(safe(e.title), left, y0, { width: titleW, continued: !!e.org, link: e.url });
          if (e.org) doc.font(F.regular).fillColor(t.muted).text(`  —  ${safe(entryMeta(e))}`, { link: undefined });
        } else {
          doc.font(F.bold).fontSize(k(10.5)).fillColor(t.ink).text(safe(e.title), left, y0, { width: titleW, link: e.url });
        }
        const yAfterTitle = doc.y;
        if (e.dates) doc.font(F.regular).fontSize(k(9.3)).fillColor(t.muted).text(safe(e.dates), left + width - dateW, y0 + 0.5, { width: dateW, align: 'right' });
        doc.y = Math.max(yAfterTitle, doc.y);
        if (!isCompact(e) && entryMeta(e)) doc.font(F.italic).fontSize(k(9.6)).fillColor(t.muted).text(safe(entryMeta(e)), left, doc.y, { width });
        if (e.meta) doc.font(F.italic).fontSize(k(9.3)).fillColor(t.muted).text(safe(e.meta), left, doc.y, { width, lineGap: gap });
        if (e.text) doc.moveDown(sp(0.1)).font(F.regular).fontSize(body).fillColor(t.ink).text(safe(e.text), left, doc.y, { width, lineGap: gap });
        if (e.bullets.length) doc.moveDown(sp(0.12));
        e.bullets.forEach((b) => bullet(b));
        for (const g of e.groups ?? []) {
          ensureRoom(body * 3);
          doc.moveDown(sp(0.2)).font(F.bold).fontSize(k(9.6)).fillColor(t.accent).text(safe(g.label), left, doc.y, { width });
          doc.moveDown(sp(0.08));
          g.bullets.forEach((b) => bullet(b));
        }
      });
    }
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  return new Promise((resolve) => doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages })));
}

const SCALES = [1, 0.95, 0.91, 0.87, 0.83, 0.8];

/**
 * Renders at the largest size that fits the page count chosen for this resume (layout.pages,
 * decided from the person's experience; 2 when unknown), tightening type and spacing step by step.
 * If even the smallest readable size can't fit, one extra page is allowed at a comfortable size
 * rather than printing tiny text.
 */
export async function resumeToPdf(r: StructuredResume, template: TemplateId = 'classic'): Promise<Buffer> {
  const t = TEMPLATES[template] ?? TEMPLATES.classic;
  const target = r.layout?.pages ?? 2;
  let last: { buffer: Buffer; pages: number } | null = null;
  for (const scale of SCALES) {
    last = await renderPdf(r, t, scale);
    if (last.pages <= target) return last.buffer;
  }
  for (const scale of SCALES.slice(0, 3)) {
    const next = await renderPdf(r, t, scale);
    if (next.pages <= target + 1) return next.buffer;
  }
  return last!.buffer;
}

/* ================= Word (.docx) ================= */

const hex = (c: string) => c.replace('#', '');

/** Text runs where unfilled [placeholders] are highlighted so they're easy to find and replace. */
function runs(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number; font?: string } = {}) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .split(/(\[[^\]]+\])/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('[') && part.endsWith(']')
        ? new TextRun({ text: part, ...opts, bold: true, highlight: 'yellow' })
        : new TextRun({ text: part, ...opts }),
    );
}

function docxBody(r: StructuredResume, t: Template) {
  const out: Paragraph[] = [];
  const dense = t.spacing < 1;
  const S = { body: Math.round(t.size.body * 2), meta: Math.round(t.size.body * 2) - 1 }; // half-points
  const gapAfter = (n: number) => Math.round(n * t.spacing);
  const center = t.header === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const link = (text: string, url: string, size: number, bold = false) =>
    new ExternalHyperlink({ link: url, children: [new TextRun({ text, size, bold, color: hex(t.accent), underline: {} })] });

  out.push(
    new Paragraph({
      alignment: center,
      children: [new TextRun({ text: r.name || 'Resume', bold: true, size: Math.round(t.size.name * 2), color: hex(t.nameColor === 'accent' ? t.accent : t.ink), font: t.docxHeadingFont })],
      spacing: { after: 30 },
    }),
  );
  if (r.headline) out.push(new Paragraph({ alignment: center, children: runs(r.headline, { size: 22, color: hex(t.accent) }), spacing: { after: 20 } }));
  if (r.tagline) out.push(new Paragraph({ alignment: center, children: runs(r.tagline, { size: S.body, color: hex(t.muted) }), spacing: { after: 20 } }));
  if (r.contacts.length) {
    const children: (TextRun | ExternalHyperlink)[] = [];
    r.contacts.forEach((c, i) => {
      if (i) children.push(new TextRun({ text: '   •   ', size: S.meta, color: hex(t.muted) }));
      children.push(c.url ? link(c.label, c.url, S.meta) : new TextRun({ text: c.label, size: S.meta, color: hex(t.muted) }));
    });
    out.push(
      new Paragraph({
        alignment: center,
        children,
        spacing: { after: 60 },
        border: t.heading === 'strong-rule' ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: hex(t.rule), space: 4 } } : undefined,
      }),
    );
  }

  const bullet = (x: string) =>
    new Paragraph({ children: runs(x, { size: S.body, color: hex(t.ink) }), bullet: { level: 0 }, spacing: { after: gapAfter(30) } });

  for (const s of r.sections) {
    out.push(
      new Paragraph({
        children: [
          ...(t.heading === 'bar' ? [new TextRun({ text: '▌ ', color: hex(t.accent), size: Math.round(t.size.heading * 2) })] : []),
          new TextRun({ text: s.title, bold: true, size: Math.round(t.size.heading * 2), color: hex(t.accent), characterSpacing: 16, font: t.docxHeadingFont }),
        ],
        spacing: { before: gapAfter(dense ? 150 : 200), after: gapAfter(80) },
        border:
          t.heading === 'bar'
            ? undefined
            : { bottom: { style: BorderStyle.SINGLE, size: t.heading === 'strong-rule' ? 8 : 6, color: hex(t.rule), space: 2 } },
        keepNext: true,
      }),
    );
    if (s.type === 'text') {
      out.push(new Paragraph({ children: runs(s.text, { size: S.body, color: hex(t.ink) }), spacing: { after: 40 }, alignment: AlignmentType.LEFT }));
    } else if (s.type === 'bullets') {
      s.items.forEach((x) => out.push(bullet(x)));
    } else if (s.type === 'skills') {
      for (const g of s.groups) {
        out.push(
          new Paragraph({
            children: [...(g.label ? [new TextRun({ text: `${g.label}: `, bold: true, size: S.body, color: hex(t.ink) })] : []), ...runs(g.items, { size: S.body, color: hex(t.ink) })],
            spacing: { after: gapAfter(30) },
          }),
        );
      }
    } else {
      s.entries.forEach((e, idx) => {
        const compact = isCompact(e);
        const title = e.url ? [link(e.title, e.url, compact ? S.body : 21, true)] : runs(e.title, { bold: true, size: compact ? S.body : 21, color: hex(t.ink) });
        out.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              ...title,
              ...(compact && entryMeta(e) ? [new TextRun({ text: `  —  ${entryMeta(e)}`, size: S.body, color: hex(t.muted) })] : []),
              ...(e.dates ? [new TextRun({ text: `\t${e.dates}`, size: S.meta, color: hex(t.muted) })] : []),
            ],
            spacing: { before: idx === 0 ? 0 : compact ? 20 : gapAfter(110), after: compact ? 20 : 0 },
            keepNext: !compact,
          }),
        );
        if (!compact && entryMeta(e)) out.push(new Paragraph({ children: runs(entryMeta(e), { italics: true, size: S.body, color: hex(t.muted) }), spacing: { after: 30 }, keepNext: true }));
        if (e.meta) out.push(new Paragraph({ children: runs(e.meta, { italics: true, size: S.meta, color: hex(t.muted) }), spacing: { after: 30 } }));
        if (e.text) out.push(new Paragraph({ children: runs(e.text, { size: S.body, color: hex(t.ink) }), spacing: { after: 30 } }));
        e.bullets.forEach((b) => out.push(bullet(b)));
        for (const g of e.groups ?? []) {
          out.push(new Paragraph({ children: [new TextRun({ text: g.label, bold: true, size: S.body, color: hex(t.accent) })], spacing: { before: 60, after: 20 }, keepNext: true }));
          g.bullets.forEach((b) => out.push(bullet(b)));
        }
      });
    }
  }
  return out;
}

export function resumeToDocx(r: StructuredResume, template: TemplateId = 'classic'): Promise<Buffer> {
  const t = TEMPLATES[template] ?? TEMPLATES.classic;
  const margin = t.spacing < 1 ? 700 : 900;
  const doc = new Document({
    creator: 'Resumint',
    title: `${r.name} - Resume`,
    styles: { default: { document: { run: { font: t.docxFont, size: Math.round(t.size.body * 2) } } } },
    sections: [{ properties: { page: { margin: { top: margin - 140, bottom: margin - 140, left: margin, right: margin } } }, children: docxBody(r, t) }],
  });
  return Packer.toBuffer(doc);
}
