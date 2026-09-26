import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scoreClass } from '../lib/api';

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page__head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Stat({ k, v, s, color }: { k: string; v: ReactNode; s?: ReactNode; color?: string }) {
  return (
    <div className="stat">
      <span className="stat__k">{color && <i style={{ background: color }} />}{k}</span>
      <span className="stat__v">{v}</span>
      {s && <span className="stat__s">{s}</span>}
    </div>
  );
}

export const ScoreBadge = ({ n }: { n: number }) => <span className={`score-badge ${scoreClass(n)}`}>{n}</span>;

export function Meters({ c }: { c: { ats: number; impact: number; keywords: number; readability: number } }) {
  const rows: Array<[string, number, string]> = [
    ['ATS', c.ats, 'var(--green)'],
    ['Readability', c.readability, 'var(--blue)'],
    ['Keywords', c.keywords, 'var(--accent)'],
    ['Impact', c.impact, 'var(--pink)'],
  ];
  return (
    <div className="meters">
      {rows.map(([label, v, color]) => (
        <div className="meter" key={label}>
          <span>{label}</span>
          <div className="track"><span style={{ width: `${v}%`, background: color }} /></div>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function Empty({ note, children }: { note?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {note && <span className="hand">{note}</span>}
      {children}
    </div>
  );
}

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

/** Shown instead of an endless spinner when a page's data fails to load (not found, no access, network). */
export function PageError({ message, backTo, backLabel }: { message: string; backTo: string; backLabel: string }) {
  return (
    <div className="page">
      <div className="card stack" style={{ alignItems: 'flex-start' }}>
        <div className="form-error" style={{ alignSelf: 'stretch' }}>{message}</div>
        <div className="row">
          <Link className="btn btn--light btn--sm" to={backTo}>← {backLabel}</Link>
          <button className="btn btn--sm" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    </div>
  );
}
