import PDFDocument from 'pdfkit';
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

// One-column, ATS-safe layout in the Resumint palette (dark enough to print well).
const INK = '#1C1B3F';
const ACCENT = '#2F2A8C';
const MUTED = '#5A5D7E';
const RULE = '#DFE3F1';
const MAX_PAGES = 2;

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
    .replace(/[  ]/g, ' ')
    .replace(/[▪●◦]/g, '•')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\xFF‘’“”•–—…€™]/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

const entryMeta = (e: Entry) => [e.org, e.location].filter(Boolean).join(' · ');
/** Short entries (certifications, awards) fit on one line: "Name — Issuer ........ 2024". */
const isCompact = (e: Entry) => !e.bullets.length && !e.text && (e.title.length + (e.org?.length ?? 0)) < 95;

function renderPdf(r: StructuredResume, scale: number): Promise<{ buffer: Buffer; pages: number }> {
  const k = (n: number) => n * scale;
  const margin = Math.round(40 + 8 * scale);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: margin - 4, bottom: margin - 6, left: margin + 4, right: margin + 4 },
    bufferPages: true,
    info: { Title: `${r.name} - Resume`, Author: r.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const body = k(9.8);
  const gap = k(1.2);
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensureRoom = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  const bullet = (text: string, indent = 0) => {
    ensureRoom(body * 1.4);
    const y0 = doc.y;
    doc.font('Helvetica').fontSize(body).fillColor(ACCENT).text('•', left + indent + 3, y0, { width: 8 });
    doc.font('Helvetica').fontSize(body).fillColor(INK).text(safe(text), left + indent + 13, y0, { width: width - indent - 13, lineGap: gap });
    doc.moveDown(k(0.14));
  };

  // Header
  doc.font('Helvetica-Bold').fontSize(k(21)).fillColor(INK).text(safe(r.name || 'Resume'), left, doc.y, { width });
  if (r.headline) doc.moveDown(k(0.12)).font('Helvetica').fontSize(k(11)).fillColor(ACCENT).text(safe(r.headline), { width });
  if (r.tagline) doc.moveDown(k(0.08)).font('Helvetica').fontSize(k(9.8)).fillColor(MUTED).text(safe(r.tagline), { width });
  if (r.contacts.length) {
    doc.moveDown(k(0.2)).font('Helvetica').fontSize(k(9.3));
    r.contacts.forEach((c: Contact, i) => {
      const last = i === r.contacts.length - 1;
      doc.fillColor(c.url ? ACCENT : MUTED).text(safe(c.label), { continued: !last, link: c.url, underline: false });
      if (!last) doc.fillColor(MUTED).text('   •   ', { continued: true, link: undefined });
    });
  }

  for (const s of r.sections) {
    ensureRoom(k(46));
    doc.moveDown(k(0.75));
    doc.font('Helvetica-Bold').fontSize(k(10.2)).fillColor(ACCENT).text(safe(s.title), left, doc.y, { width, characterSpacing: 1 });
    const ruleY = doc.y + 1.5;
    doc.moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(0.7).strokeColor(RULE).stroke();
    doc.y = ruleY + k(5);

    if (s.type === 'text') {
      doc.font('Helvetica').fontSize(body).fillColor(INK).text(safe(s.text), left, doc.y, { width, lineGap: gap, align: 'left' });
    } else if (s.type === 'bullets') {
      s.items.forEach((t) => bullet(t));
    } else if (s.type === 'skills') {
      for (const g of s.groups) {
        ensureRoom(body * 1.4);
        if (g.label) {
          doc.font('Helvetica-Bold').fontSize(body).fillColor(INK).text(`${safe(g.label)}: `, left, doc.y, { width, continued: true, lineGap: gap });
          doc.font('Helvetica').fillColor(INK).text(safe(g.items), { lineGap: gap });
        } else {
          doc.font('Helvetica').fontSize(body).fillColor(INK).text(safe(g.items), left, doc.y, { width, lineGap: gap });
        }
        doc.moveDown(k(0.12));
      }
    } else {
      s.entries.forEach((e, idx) => {
        ensureRoom(k(isCompact(e) ? 16 : 34));
        if (idx > 0) doc.moveDown(k(isCompact(e) ? 0.1 : 0.4));
        const y0 = doc.y;
        const dateW = e.dates ? Math.min(width * 0.32, doc.font('Helvetica').fontSize(k(9.3)).widthOfString(safe(e.dates)) + 6) : 0;
        const titleW = width - dateW - 8;
        if (isCompact(e)) {
          doc.font('Helvetica-Bold').fontSize(body).fillColor(INK).text(safe(e.title), left, y0, { width: titleW, continued: !!e.org, link: e.url });
          if (e.org) doc.font('Helvetica').fillColor(MUTED).text(`  —  ${safe(entryMeta(e))}`, { link: undefined });
        } else {
          doc.font('Helvetica-Bold').fontSize(k(10.5)).fillColor(INK).text(safe(e.title), left, y0, { width: titleW, link: e.url });
        }
        const yAfterTitle = doc.y;
        if (e.dates) doc.font('Helvetica').fontSize(k(9.3)).fillColor(MUTED).text(safe(e.dates), left + width - dateW, y0 + 0.5, { width: dateW, align: 'right' });
        doc.y = Math.max(yAfterTitle, doc.y);
        if (!isCompact(e) && entryMeta(e)) doc.font('Helvetica-Oblique').fontSize(k(9.6)).fillColor(MUTED).text(safe(entryMeta(e)), left, doc.y, { width });
        if (e.text) doc.moveDown(k(0.1)).font('Helvetica').fontSize(body).fillColor(INK).text(safe(e.text), left, doc.y, { width, lineGap: gap });
        if (e.bullets.length) doc.moveDown(k(0.12));
        e.bullets.forEach((b) => bullet(b));
      });
    }
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  return new Promise((resolve) => doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages })));
}

/** Renders at the largest size that fits in MAX_PAGES (tightening type and spacing step by step). */
export async function resumeToPdf(r: StructuredResume): Promise<Buffer> {
  let last: { buffer: Buffer; pages: number } | null = null;
  for (const scale of [1, 0.95, 0.91, 0.87, 0.83, 0.8]) {
    last = await renderPdf(r, scale);
    if (last.pages <= MAX_PAGES) return last.buffer;
  }
  return last!.buffer; // very long resume: smallest readable size, may exceed 2 pages
}

/* ================= Word (.docx) ================= */

const hex = (c: string) => c.replace('#', '');

/** Text runs where unfilled [placeholders] are highlighted so they're easy to find and replace. */
function runs(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
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

const link = (text: string, url: string, size: number, bold = false) =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text, size, bold, color: hex(ACCENT), underline: {} })] });

function docxBody(r: StructuredResume) {
  const out: Paragraph[] = [];
  const S = { body: 19, meta: 18 }; // half-points: 9.5pt body

  out.push(new Paragraph({ children: [new TextRun({ text: r.name || 'Resume', bold: true, size: 40, color: hex(INK) })], spacing: { after: 30 } }));
  if (r.headline) out.push(new Paragraph({ children: runs(r.headline, { size: 22, color: hex(ACCENT) }), spacing: { after: 20 } }));
  if (r.tagline) out.push(new Paragraph({ children: runs(r.tagline, { size: S.body, color: hex(MUTED) }), spacing: { after: 20 } }));
  if (r.contacts.length) {
    const children: (TextRun | ExternalHyperlink)[] = [];
    r.contacts.forEach((c, i) => {
      if (i) children.push(new TextRun({ text: '   •   ', size: S.meta, color: hex(MUTED) }));
      children.push(c.url ? link(c.label, c.url, S.meta) : new TextRun({ text: c.label, size: S.meta, color: hex(MUTED) }));
    });
    out.push(new Paragraph({ children, spacing: { after: 60 } }));
  }

  const bullet = (t: string) => new Paragraph({ children: runs(t, { size: S.body, color: hex(INK) }), bullet: { level: 0 }, spacing: { after: 30 } });

  for (const s of r.sections) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: s.title, bold: true, size: 20, color: hex(ACCENT), characterSpacing: 16 })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(RULE), space: 2 } },
        keepNext: true,
      }),
    );
    if (s.type === 'text') {
      out.push(new Paragraph({ children: runs(s.text, { size: S.body, color: hex(INK) }), spacing: { after: 40 }, alignment: AlignmentType.LEFT }));
    } else if (s.type === 'bullets') {
      s.items.forEach((t) => out.push(bullet(t)));
    } else if (s.type === 'skills') {
      for (const g of s.groups) {
        out.push(
          new Paragraph({
            children: [...(g.label ? [new TextRun({ text: `${g.label}: `, bold: true, size: S.body, color: hex(INK) })] : []), ...runs(g.items, { size: S.body, color: hex(INK) })],
            spacing: { after: 30 },
          }),
        );
      }
    } else {
      s.entries.forEach((e, idx) => {
        const compact = isCompact(e);
        const title = e.url ? [link(e.title, e.url, compact ? S.body : 21, true)] : runs(e.title, { bold: true, size: compact ? S.body : 21, color: hex(INK) });
        out.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              ...title,
              ...(compact && entryMeta(e) ? [new TextRun({ text: `  —  ${entryMeta(e)}`, size: S.body, color: hex(MUTED) })] : []),
              ...(e.dates ? [new TextRun({ text: `\t${e.dates}`, size: S.meta, color: hex(MUTED) })] : []),
            ],
            spacing: { before: idx === 0 ? 0 : compact ? 20 : 110, after: compact ? 20 : 0 },
            keepNext: !compact,
          }),
        );
        if (!compact && entryMeta(e)) out.push(new Paragraph({ children: runs(entryMeta(e), { italics: true, size: S.body, color: hex(MUTED) }), spacing: { after: 30 }, keepNext: true }));
        if (e.text) out.push(new Paragraph({ children: runs(e.text, { size: S.body, color: hex(INK) }), spacing: { after: 30 } }));
        e.bullets.forEach((b) => out.push(bullet(b)));
      });
    }
  }
  return out;
}

export function resumeToDocx(r: StructuredResume): Promise<Buffer> {
  const doc = new Document({
    creator: 'Resumint',
    title: `${r.name} - Resume`,
    styles: { default: { document: { run: { font: 'Calibri', size: 19 } } } },
    sections: [{ properties: { page: { margin: { top: 760, bottom: 760, left: 900, right: 900 } } }, children: docxBody(r) }],
  });
  return Packer.toBuffer(doc);
}
