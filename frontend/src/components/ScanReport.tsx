import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Scan } from '../lib/api';
import { Meters } from './Ui';

const sevChip = { high: 'chip--c', medium: 'chip--y', low: 'chip--g' } as const;

export function ScanReport({ scan }: { scan: Scan }) {
  const r = scan.result;
  const [tab, setTab] = useState(0);
  const rewrite = r.rewrites?.[tab];
  const totalIssues = r.counts?.issues ?? r.issues?.length ?? 0;
  const hiddenIssues = Math.max(0, totalIssues - (r.issues?.length ?? 0));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="grid-3">
        <div className="card card--ink" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="eyebrow">{r.hasJobDescription ? 'Job match score' : 'Resume score'}</p>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="big-score">{scan.score}</span>
                <span className="muted">/ 100</span>
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                {r.hasJobDescription ? 'How well this resume fits the job description' : 'Average of ATS, impact, keywords and readability'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.targetRole && <span className="chip chip--b">{r.targetRole}</span>}
              <p className="small muted" style={{ marginTop: 8 }}>{scan.fileName}</p>
            </div>
          </div>
          <Meters c={r.categories} />
          {r.insights && <p style={{ fontSize: 15, lineHeight: 1.6 }}>{r.insights}</p>}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card__title"><h3>Strengths</h3><span className="chip chip--g">{r.strengths?.length ?? 0}</span></div>
          <ul className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0, fontSize: 14 }}>
            {r.strengths?.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          {r.gaps && r.gaps.length > 0 && (
            <>
              <div className="card__title" style={{ marginTop: 8 }}><h3>Gaps</h3><span className="chip chip--p">{r.gaps.length}</span></div>
              <ul className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0, fontSize: 14 }}>
                {r.gaps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}
          {scan.locked && <p className="small muted">Unlock Pro to see every strength and gap.</p>}
        </div>
      </div>

      <div className="card">
        <div className="card__title">
          <h3>Issues to fix, ranked by impact</h3>
          <span className="chip chip--plain">{scan.locked ? `${r.issues?.length ?? 0} of ${totalIssues}` : totalIssues}</span>
        </div>
        <div className="issue-list">
          {r.issues?.map((i, n) => (
            <div key={n} className={`issue-row ${i.severity}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{i.title}</b>
                <span className="row" style={{ gap: 6 }}>
                  {i.check && <span className="chip chip--plain">{i.check}</span>}
                  <span className={`chip ${sevChip[i.severity]}`}>{i.severity}</span>
                </span>
              </div>
              <p>{i.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {scan.locked ? (
        <div className="locked">
          <span className="hand" style={{ fontSize: 26, color: 'var(--hot)' }}>there's more ↓</span>
          <b style={{ fontSize: 18 }}>
            {hiddenIssues > 0 ? `${hiddenIssues} more issues, ` : ''}
            {r.counts?.rewrites ?? 3} bullet rewrites and {r.counts?.missingKeywords ?? 0} missing keywords
          </b>
          <span className="muted">Unlock the full report, JD matching, AI chat and unlimited re-scans for a one-time ₹99.</span>
          <Link className="btn btn--accent" to="/app/billing">Unlock everything <span className="arrow">→</span></Link>
        </div>
      ) : (
        <>
          {r.keywords && (r.keywords.have.length > 0 || r.keywords.missing.length > 0) && (
            <div className="match">
              <label>{r.hasJobDescription ? 'Keywords vs. the job description' : 'Keywords for your target role'}</label>
              <div className="kw">
                {r.keywords.have.map((k, i) => <span key={`h${i}`} className="have">✓ {k}</span>)}
                {r.keywords.missing.map((k, i) => <span key={`m${i}`} className="miss">+ {k}</span>)}
              </div>
              <span className="small" style={{ opacity: 0.7 }}>Green = proven in your resume · dashed = missing (add it only where it's true).</span>
            </div>
          )}
          {rewrite && (
            <div className="rewrite">
              <span className="rewrite__note hand" aria-hidden="true">much better!</span>
              <div className="rewrite__tabs" role="tablist" aria-label="Bullet rewrites">
                {r.rewrites!.map((_, i) => (
                  <button key={i} role="tab" type="button" aria-selected={i === tab} onClick={() => setTab(i)}>
                    Bullet {i + 1}
                  </button>
                ))}
              </div>
              <p className="eyebrow">Before</p>
              <p className="rewrite__before"><span className="strike">{rewrite.before}</span></p>
              <p className="eyebrow">After</p>
              <p className="rewrite__after">{rewrite.after}</p>
              {rewrite.why && <span className="rewrite__tip">+ {rewrite.why}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
