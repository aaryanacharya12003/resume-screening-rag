import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, OptimizeJob, Scan } from '../lib/api';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { diffWords } from '../lib/diff';
import { findResultGaps } from '../lib/resultGaps';

const TARGET = 90;

/** Chips that name a credential need extra care: claiming an unearned certification is easy to catch and costly. */
const isCertification = (s: string) =>
  /certif|\b(CKA|CKS|CKAD|CISSP|CISM|CEH|OSCP|PMP)\b|\b(AZ|SC|GH|DP|AI)-\d{3}\b|associate|professional/i.test(s);

/** "Boost to 90+" card on a report: optional skill confirmation, then a background job with live progress. */
export function BoostCard({ scan, canUse }: { scan: Scan; canUse: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const missing = scan.result.keywords?.missing ?? [];
  const [picked, setPicked] = useState<Record<string, string | undefined>>({});
  // Real outcomes for bullets that don't state one: the only honest way to raise Impact.
  const gaps = useMemo(() => findResultGaps(scan.result.resumeText ?? ''), [scan.result.resumeText]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [showAllGaps, setShowAllGaps] = useState(false);
  // Boost needs something real to add: a result for a bullet or a skill the candidate has.
  const needsInput = gaps.length > 0 || missing.length > 0;
  const hasInput = Object.keys(picked).length > 0 || Object.values(results).some((v) => v.trim().length >= 2);
  const [job, setJob] = useState<OptimizeJob | null>(null);
  const [err, setErr] = useState<{ text: string; blockers?: string[] } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number>();

  useEffect(() => () => window.clearInterval(timer.current), []);

  if (scan.score >= TARGET) {
    return (
      <div className="card card--panel row" style={{ justifyContent: 'space-between' }}>
        <div>
          <span className="hand" style={{ fontSize: 26, color: 'var(--accent)' }}>you're at {scan.score}!</span>
          <p style={{ opacity: 0.85 }}>This resume already scores in the 90–100 range.</p>
        </div>
      </div>
    );
  }

  if (!canUse) {
    return (
      <div className="locked">
        <span className="hand" style={{ fontSize: 26, color: 'var(--hot)' }}>want 90+?</span>
        <b style={{ fontSize: 18 }}>Boost this resume to a 90–100 score</b>
        <span className="muted">The optimizer rewrites every line, fact-checks it against your real experience, and re-scores it. Included in Pro.</span>
        <Link className="btn btn--accent" to="/app/billing">Unlock with Pro →</Link>
      </div>
    );
  }

  const poll = (id: string) => {
    const started = Date.now();
    timer.current = window.setInterval(async () => {
      setElapsed(Math.round((Date.now() - started) / 1000));
      try {
        const { data } = await api.get<OptimizeJob>(`/scans/optimize-jobs/${id}`);
        setJob(data);
        if (data.status === 'done' && data.resultScanId) {
          window.clearInterval(timer.current);
          await qc.invalidateQueries({ queryKey: ['scans'] });
          nav(`/app/scans/${data.resultScanId}`);
        } else if (data.status === 'failed') {
          window.clearInterval(timer.current);
          setJob(null);
          setErr({ text: data.error || 'Optimization failed', blockers: data.blockers });
        }
      } catch (e) {
        window.clearInterval(timer.current);
        setJob(null);
        setErr({ text: errMsg(e) });
      }
    }, 2500);
  };

  const start = async () => {
    setErr(null);
    setElapsed(0);
    const confirmedSkills = Object.entries(picked)
      .filter(([, v]) => v !== undefined)
      .map(([skill, detail]) => ({ skill, detail: detail?.trim() || undefined }));
    const confirmedResults = Object.entries(results)
      .map(([bullet, result]) => ({ bullet, result: result.trim() }))
      .filter((r) => r.result.length >= 2);
    try {
      const { data } = await api.post<OptimizeJob>(`/scans/${scan.id}/optimize`, { confirmedSkills, confirmedResults });
      setJob(data);
      poll(data.id);
    } catch (e) {
      setErr({ text: errMsg(e) });
    }
  };

  const toggle = (skill: string) =>
    setPicked((p) => {
      const next = { ...p };
      if (skill in next) delete next[skill];
      else next[skill] = '';
      return next;
    });

  return (
    <div className="card card--ink stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow">Resume optimizer</p>
          <h3 style={{ font: '500 28px/1.15 var(--display)' }}>
            Boost from <span className="mark pink">{scan.score}</span> to <span className="mark">90+</span>
          </h3>
          <p className="muted" style={{ maxWidth: '62ch' }}>
            We edit your resume area by area, fact-check every change so it never claims skills, numbers or roles you don't have,
            and keep a version only if no score goes down. Real results you add below are the biggest lever.
          </p>
        </div>
      </div>

      {missing.length > 0 && !job && (
        <div className="stack" style={{ gap: 10 }}>
          <b style={{ fontSize: 14 }}>
            {scan.result.hasJobDescription ? 'This job asks for skills your resume doesn’t show.' : 'Skills your target role expects that your resume doesn’t show.'}{' '}
            <span className="muted" style={{ fontWeight: 500 }}>Tick only the ones you genuinely have. They're the biggest lever for 90+.</span>
          </b>
          <div className="row" style={{ gap: 8 }}>
            {[...new Set(missing)].map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${m in picked ? 'chip--g' : 'chip--plain'}`}
                style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 12 }}
                aria-pressed={m in picked}
                onClick={() => toggle(m)}
              >
                {m in picked ? '✓ ' : '+ '}
                {m}
              </button>
            ))}
          </div>
          {Object.keys(picked).map((skill) => (
            <label key={skill} className="field">
              <span>
                {isCertification(skill)
                  ? `Certification: which exact one and when did you earn it? (tick only if you hold it)`
                  : `How have you used ${skill}? (optional, one line)`}
              </span>
              <input
                className="input input--sm"
                maxLength={300}
                value={picked[skill] ?? ''}
                placeholder={isCertification(skill) ? 'e.g. AWS Certified Solutions Architect – Associate, 2025' : `e.g. Used ${skill} at your last job for …`}
                onChange={(e) => setPicked((p) => ({ ...p, [skill]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      {gaps.length > 0 && !job && (
        <div className="stack" style={{ gap: 10 }}>
          <b style={{ fontSize: 14 }}>
            Add real results to these bullets.{' '}
            <span className="muted" style={{ fontWeight: 500 }}>
              They describe work but not what it achieved: what improved, and by how much? Only fill in numbers you can back up in an interview; leave the rest blank.
            </span>
          </b>
          {(showAllGaps ? gaps : gaps.slice(0, 4)).map((bullet) => (
            <label key={bullet} className="field">
              <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>“{bullet}”</span>
              <input
                className="input input--sm"
                maxLength={200}
                value={results[bullet] ?? ''}
                placeholder="e.g. cut page load from 4s to 1.2s"
                onChange={(e) => setResults((r) => ({ ...r, [bullet]: e.target.value }))}
              />
            </label>
          ))}
          {gaps.length > 4 && (
            <button type="button" className="btn btn--sm btn--light" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAllGaps((v) => !v)}>
              {showAllGaps ? 'Show fewer' : `Show ${gaps.length - 4} more`}
            </button>
          )}
        </div>
      )}

      {err && (
        <div className="form-error stack" style={{ gap: 8 }}>
          <span>{err.text}</span>
          {err.blockers && err.blockers.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {err.blockers.map((b, i) => <span key={i} className="chip chip--p">{b}</span>)}
            </div>
          )}
        </div>
      )}

      {job ? (
        <div className="result" style={{ border: '1.5px solid var(--line)' }}>
          <div className="scanning">
            <span className="hand" style={{ fontSize: 24, color: 'var(--hot)' }}>{job.step}…</span>
            <div className="bar"><span style={{ width: `${Math.min(95, 8 + elapsed * 1.1)}%` }} /></div>
            <small className="muted">{elapsed}s · usually 2–3 minutes. You can leave this page; the new version will appear in My scans.</small>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, alignItems: 'flex-start' }}>
          <button className="btn btn--accent" onClick={start} disabled={needsInput && !hasInput} aria-describedby={needsInput && !hasInput ? 'boost-hint' : undefined}>
            Boost to 90+ <span className="arrow">→</span>
          </button>
          {needsInput && !hasInput && (
            <>
              <small id="boost-hint" className="muted">
                Add a real result to at least one bullet above, or tick a skill you have. Rewording alone usually can't raise the score without lowering another area.
              </small>
              <button type="button" className="btn btn--sm btn--light" onClick={start}>
                Try rewording only
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Highlights [placeholders] so the user sees what they still need to fill in. */
function ResumeText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <pre className="resume-text">
      {parts.map((p, i) => (p.startsWith('[') && p.endsWith(']') ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </pre>
  );
}

type ExportFormat = 'pdf' | 'docx';

function useResumeActions(scan: Scan) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const text = scan.result.resumeText ?? '';
  return {
    text,
    busy,
    copy: async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast('Resume copied');
      } catch {
        toast('Copy failed. Select the text and copy it manually.', true);
      }
    },
    /** Downloads the server-formatted file (designed PDF or editable Word document). */
    download: async (format: ExportFormat) => {
      setBusy(format);
      try {
        const res = await api.get(`/scans/${scan.id}/export`, { params: { format }, responseType: 'blob' });
        const name =
          /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? `resume.${format}`;
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        if ((text.match(/\[[^\]]+\]/g) || []).length) {
          toast(format === 'docx' ? 'Placeholders are highlighted in yellow: fill them in before sending' : 'Remember to fill in the [placeholders] before sending');
        }
      } catch (e) {
        // Blob responses hide the JSON error body, so read it back for a useful message.
        const body = (e as { response?: { data?: Blob } })?.response?.data;
        let msg = errMsg(e);
        if (body instanceof Blob) {
          try {
            msg = JSON.parse(await body.text()).error || msg;
          } catch {
            /* keep generic message */
          }
        }
        toast(msg, true);
      } finally {
        setBusy(null);
      }
    },
  };
}

/** Edit a version's text (e.g. fill in [placeholders]) and score it as a new version. */
export function EditRescoreModal({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState(scan.result.resumeText ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = (text.match(/\[[^\]]+\]/g) || []).length;

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post<Scan>(`/scans/${scan.id}/rescore`, { text });
      await qc.invalidateQueries({ queryKey: ['scans'] });
      onClose();
      nav(`/app/scans/${data.id}`);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit & re-score" onClose={() => !busy && onClose()} wide>
      <p className="muted small">
        Replace each <b>[placeholder]</b> with your real number (or delete it), make any other edits, then score it again.
        {scan.result.hasJobDescription ? ' It is scored against the same job description.' : ''} Your current version stays untouched.
      </p>
      {err && <div className="form-error">{err}</div>}
      <textarea
        className="textarea resume-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck
        disabled={busy}
        aria-label="Resume text"
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className={`small ${left ? '' : 'muted'}`} style={left ? { color: 'var(--warn)', fontWeight: 700 } : undefined}>
          {left ? `${left} placeholder${left > 1 ? 's' : ''} still to fill in` : 'No placeholders left'}
        </span>
        <div className="row">
          <button className="btn btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn--accent" onClick={save} disabled={busy || text.trim().length < 200}>
            {busy ? <><span className="spinner" /> Scoring… (~15s)</> : <>Save & re-score <span className="arrow">→</span></>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Download / PDF / copy / edit actions for any scan whose text we have. */
export function VersionActions({ scan, onEdit }: { scan: Scan; onEdit: () => void }) {
  const a = useResumeActions(scan);
  if (!a.text) return null;
  return (
    <div className="row">
      <button className="btn btn--accent btn--sm" onClick={() => a.download('pdf')} disabled={a.busy !== null}>
        {a.busy === 'pdf' && <span className="spinner" />} Download PDF
      </button>
      <button className="btn btn--accent btn--sm" onClick={() => a.download('docx')} disabled={a.busy !== null}>
        {a.busy === 'docx' && <span className="spinner" />} Download Word
      </button>
      <button className="btn btn--light btn--sm" onClick={a.copy}>Copy</button>
      <button className="btn btn--light btn--sm" onClick={onEdit}>Edit & re-score</button>
    </div>
  );
}

/** Shown on a version created by the optimizer or by editing: before/after, what changed, and the text to take away. */
const CATS: Array<[keyof Scan['result']['categories'], string]> = [
  ['ats', 'ATS'],
  ['impact', 'Impact'],
  ['keywords', 'Keywords'],
  ['readability', 'Readability'],
];

/** Per-category before → after, so "same score" still shows what moved up and what moved down. */
function CategoryDeltas({ before, after }: { before: Scan['result']['categories']; after: Scan['result']['categories'] }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      {CATS.map(([k, label]) => {
        const d = (after?.[k] ?? 0) - (before?.[k] ?? 0);
        return (
          <span key={k} className={`chip ${d > 0 ? 'chip--g' : d < 0 ? 'chip--c' : 'chip--plain'}`} title={`${label}: ${before?.[k]} → ${after?.[k]}`}>
            {label} {before?.[k]} → {after?.[k]} {d ? `(${d > 0 ? '+' : ''}${d})` : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Inline word diff: removed text struck through in red, added text highlighted in green. */
function ChangesView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const added = parts.filter((p) => p.kind === 'add').reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
  const removed = parts.filter((p) => p.kind === 'del').reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
  return (
    <div className="card">
      <div className="card__title">
        <h3>Changes from the previous version</h3>
        <span className="row small" style={{ gap: 6 }}>
          <span className="chip chip--g">+{added} words</span>
          <span className="chip chip--c">−{removed} words</span>
        </span>
      </div>
      <pre className="resume-text diff">
        {parts.map((p, i) =>
          p.kind === 'same' ? <Fragment key={i}>{p.text}</Fragment> : p.kind === 'add' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>,
        )}
      </pre>
    </div>
  );
}

export function VersionPanel({ scan }: { scan: Scan }) {
  const [editing, setEditing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const o = scan.result.optimized;
  const e = scan.result.editedFrom;
  const from = o ? { id: o.fromScanId, score: o.fromScore } : e ? { id: e.scanId, score: e.score } : null;
  const prev = useQuery({
    queryKey: ['scan', from?.id],
    enabled: !!from,
    queryFn: async () => (await api.get<Scan>(`/scans/${from!.id}`)).data,
  });
  if (!from) return null;
  const text = scan.result.resumeText ?? '';
  const prevText = prev.data?.result.resumeText ?? '';
  const placeholders = (text.match(/\[[^\]]+\]/g) || []).length;
  const delta = scan.score - from.score;
  const lengthChange = prevText ? Math.round(((text.length - prevText.length) / prevText.length) * 100) : 0;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card card--panel row" style={{ justifyContent: 'space-between', gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <p className="eyebrow" style={{ color: 'rgba(245,246,252,.65)' }}>
            {o ? 'Optimized version' : 'Edited version'} · {fmtDate(scan.createdAt)}
          </p>
          <div className="row" style={{ alignItems: 'baseline', gap: 14 }}>
            <span style={{ font: '500 44px/1 var(--display)', opacity: 0.6, textDecoration: delta ? 'line-through' : 'none', textDecorationColor: 'var(--hot)' }}>
              {from.score}
            </span>
            <span style={{ fontSize: 28 }}>→</span>
            <span style={{ font: '500 64px/1 var(--display)' }}>{scan.score}</span>
            <span className={`chip ${delta > 0 ? 'chip--g' : delta < 0 ? 'chip--c' : 'chip--plain'}`}>
              {delta > 0 ? `+${delta} points` : delta < 0 ? `${delta} points` : 'same score'}
            </span>
          </div>
          {prev.data && <CategoryDeltas before={prev.data.result.categories} after={scan.result.categories} />}
          {o && delta === 0 && (
            <p style={{ opacity: 0.85, fontSize: 14, maxWidth: '62ch' }}>
              {scan.result.hasJobDescription
                ? "The wording improved, but the overall match holds because the job asks for experience your resume doesn't show."
                : 'Some categories went up and others down, so the overall score evened out.'}{' '}
              Use <b>Show changes</b> to see every edit. Fill in placeholders and re-score, or tick skills you really have and boost again.
            </p>
          )}
          {prevText && lengthChange <= -15 && (
            <p style={{ fontSize: 13, maxWidth: '62ch', color: 'var(--accent)' }}>
              This version is {Math.abs(lengthChange)}% shorter than the previous one. Check Show changes for anything you want to keep.
            </p>
          )}
          {o && !o.reachedTarget && o.blockers && o.blockers.length > 0 && (
            <p style={{ opacity: 0.85, fontSize: 14, maxWidth: '62ch' }}>
              Remaining gap to 90+: <b>{o.blockers.join(', ')}</b>.
            </p>
          )}
        </div>
        <div className="stack" style={{ gap: 10, alignItems: 'flex-end' }}>
          <VersionActions scan={scan} onEdit={() => setEditing(true)} />
          {prevText && (
            <button className="btn btn--light btn--sm" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? 'Hide changes' : 'Show changes'}
            </button>
          )}
        </div>
      </div>

      {showDiff && prevText && <ChangesView before={prevText} after={text} />}

      {placeholders > 0 && (
        <div className="form-error row" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)', justifyContent: 'space-between' }}>
          <span>
            Fill in the {placeholders} highlighted <b>[placeholder]</b>{placeholders > 1 ? 's' : ''} with your real numbers before sending this resume,
            then re-score. Delete any you can't back up.
          </span>
          <button className="btn btn--accent btn--sm" onClick={() => setEditing(true)}>Fill in & re-score</button>
        </div>
      )}

      <div className="grid-3">
        <div className="card">
          <div className="card__title">
            <h3>{o ? 'Your optimized resume' : 'Your edited resume'}</h3>
            <Link className="link small" to={`/app/compare?a=${from.id}&b=${scan.id}`}>Compare with previous →</Link>
          </div>
          <ResumeText text={text} />
        </div>
        <div className="card stack">
          {o ? (
            <>
              <div className="card__title" style={{ margin: 0 }}><h3>What we changed</h3></div>
              <ul className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0, fontSize: 14 }}>
                {o.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              {!!o.confirmedResults && (
                <p className="small muted">Used {o.confirmedResults} result{o.confirmedResults === 1 ? '' : 's'} you added.</p>
              )}
              {o.confirmedSkills && o.confirmedSkills.length > 0 && (
                <p className="small muted">Added from skills you confirmed: {o.confirmedSkills.join(', ')}.</p>
              )}
              <p className="small muted">Every claim was checked against your original resume; nothing was invented.</p>
            </>
          ) : (
            <>
              <div className="card__title" style={{ margin: 0 }}><h3>About this version</h3></div>
              <p className="small muted">You edited the previous version and re-scored it. Keep editing and re-scoring until you're happy, then download it.</p>
            </>
          )}
        </div>
      </div>
      {editing && <EditRescoreModal scan={scan} onClose={() => setEditing(false)} />}
    </div>
  );
}
