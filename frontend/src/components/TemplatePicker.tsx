import { CSSProperties, useState } from 'react';
import { Modal } from './Modal';

// Mirrors backend/src/lib/resumeExport.ts TEMPLATES (ids, names, colours, fonts).
export type TemplateId = 'classic' | 'modern' | 'minimal' | 'compact' | 'executive';

interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  accent: string;
  ink: string;
  serif: boolean;
  center: boolean;
  heading: 'rule' | 'bar' | 'strong-rule';
  dense: boolean;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'classic', name: 'Classic', description: 'Clean sans-serif with indigo accents. Works for any role.', accent: '#2F2A8C', ink: '#1C1B3F', serif: false, center: false, heading: 'rule', dense: false },
  { id: 'modern', name: 'Modern', description: 'Teal accent bar and a coloured name. Suits tech and product roles.', accent: '#0F766E', ink: '#16212B', serif: false, center: false, heading: 'bar', dense: false },
  { id: 'minimal', name: 'Minimal', description: 'Black and grey serif, centred header. Quiet and traditional.', accent: '#111111', ink: '#111111', serif: true, center: true, heading: 'strong-rule', dense: false },
  { id: 'compact', name: 'Compact', description: 'Dense slate layout that fits more on each page.', accent: '#334155', ink: '#1E293B', serif: false, center: false, heading: 'rule', dense: true },
  { id: 'executive', name: 'Executive', description: 'Navy serif headings, centred header. For senior and leadership roles.', accent: '#1E3A5F', ink: '#1B2433', serif: true, center: true, heading: 'strong-rule', dense: false },
];

const KEY = 'resumint.template';

/** The template the user last picked, remembered in this browser (storage can be unavailable). */
export function useTemplateChoice() {
  const [id, setId] = useState<TemplateId>(() => {
    try {
      const v = localStorage.getItem(KEY);
      return TEMPLATES.some((t) => t.id === v) ? (v as TemplateId) : 'classic';
    } catch {
      return 'classic';
    }
  });
  const choose = (next: TemplateId) => {
    setId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* choice still applies for this visit */
    }
  };
  return [id, choose] as const;
}

/** A small drawn sample of the template: header, a section title in its style, and text lines. */
function Preview({ t }: { t: TemplateInfo }) {
  const line = (w: string, color = '#C9CCDA', h = 3): CSSProperties => ({ width: w, height: h, background: color, borderRadius: 2 });
  const gap = t.dense ? 3 : 5;
  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: gap + 2 }}>
      {t.heading === 'bar' && <span style={{ width: 3, height: 8, background: t.accent }} />}
      <span style={{ ...line('38%', t.accent, 4) }} />
    </div>
  );
  const rule = t.heading === 'bar' ? null : <div style={{ height: t.heading === 'strong-rule' ? 1.5 : 1, background: t.heading === 'strong-rule' ? t.ink : '#DFE3F1', marginTop: 2 }} />;
  return (
    <div aria-hidden="true" style={{ background: '#fff', border: '1px solid #DFE3F1', borderRadius: 6, padding: '10px 12px', height: 132, display: 'flex', flexDirection: 'column', gap, fontFamily: t.serif ? 'Georgia, serif' : 'inherit' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: t.center ? 'center' : 'flex-start', gap: 3 }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: t.id === 'modern' || t.id === 'executive' ? t.accent : t.ink, letterSpacing: '.02em' }}>ALEX MORGAN</span>
        <span style={line('55%', t.accent)} />
        <span style={line('70%')} />
      </div>
      {t.heading === 'strong-rule' && <div style={{ height: 1.5, background: t.ink }} />}
      {title}
      {rule}
      <span style={line('92%')} />
      <span style={line('84%')} />
      {title}
      {rule}
      <span style={line('88%')} />
      {!t.dense ? null : <span style={line('80%')} />}
    </div>
  );
}

/** "Template: Classic" button that opens a picker of the available resume designs. */
export function TemplatePicker({ value, onChange }: { value: TemplateId; onChange: (id: TemplateId) => void }) {
  const [open, setOpen] = useState(false);
  const current = TEMPLATES.find((t) => t.id === value) ?? TEMPLATES[0];
  return (
    <>
      <button type="button" className="btn btn--light btn--sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Template: <b>{current.name}</b>
      </button>
      {open && (
        <Modal title="Choose a template" onClose={() => setOpen(false)} wide>
          <p className="muted small">
            Every design is a single column that applicant tracking systems read the same way. The page count follows your experience.
          </p>
          <div className="template-grid" role="radiogroup" aria-label="Resume templates">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === value}
                className={`template-card${t.id === value ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <Preview t={t} />
                <b>{t.name}</b>
                <span className="small muted">{t.description}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
