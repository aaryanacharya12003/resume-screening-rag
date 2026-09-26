import { DragEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errMsg, isUpgradeError, Scan } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { takePendingResume } from '../../lib/pending';
import { PageHead } from '../../components/Ui';

const STEPS = ['Reading your resume', 'Checking ATS parsing', 'Scoring impact & readability', 'Matching keywords', 'Writing your rewrites'];

export default function NewScan() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<{ text: string; upgrade: boolean } | null>(null);

  const canJd = me!.plan.features.includes('jdMatch');
  const outOfFree = me!.plan.limits.scansTotal !== null && me!.usage.scansTotal >= me!.plan.limits.scansTotal;

  useEffect(() => {
    let live = true;
    takePendingResume().then((pending) => {
      if (live && pending) setFile(pending);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  const choose = (f?: File | null) => {
    if (!f) return;
    if (!/\.(pdf|txt)$/i.test(f.name)) return setErr({ text: 'Please upload a PDF or .txt file', upgrade: false });
    if (f.size > 4 * 1024 * 1024) return setErr({ text: 'That file is over 4 MB', upgrade: false });
    setErr(null);
    setFile(f);
  };

  const run = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('resume', file);
    if (jd.trim()) fd.append('jobDescriptionText', jd.trim());
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<Scan>('/scans', fd);
      await Promise.all([qc.invalidateQueries({ queryKey: ['scans'] }), refresh()]);
      nav(`/app/scans/${data.id}`);
    } catch (e) {
      setErr({ text: errMsg(e), upgrade: isUpgradeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead title="New scan" sub="Upload a resume. Add a job description to get a match score and keyword gaps for that role." />

      {outOfFree && (
        <div className="locked">
          <b style={{ fontSize: 18 }}>You've used your free scan</b>
          <span className="muted">Pro gives you unlimited scans, the full report, JD matching and AI chat for a one-time ₹99.</span>
          <Link className="btn btn--accent" to="/app/billing">Upgrade to Pro →</Link>
        </div>
      )}

      <div className="upload" style={{ transform: 'rotate(0.6deg)' }}>
        <span className="upload__note hand" aria-hidden="true">{file ? 'nice!' : 'drop it here!'}</span>
        {busy ? (
          <div className="result">
            <div className="scanning">
              <span className="hand" style={{ fontSize: 26, color: 'var(--hot)' }}>{STEPS[step]}…</span>
              <div className="bar"><span style={{ width: `${((step + 1) / STEPS.length) * 92}%` }} /></div>
              <small className="muted">{file?.name} · usually 10–25 seconds</small>
            </div>
          </div>
        ) : (
          <label
            className={`drop${over ? ' is-over' : ''}`}
            htmlFor="resume-file"
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span className="drop__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
            </span>
            <strong>{file ? file.name : 'Drop your resume here or browse'}</strong>
            <small>{file ? `${(file.size / 1024).toFixed(0)} KB · click to replace` : 'PDF or TXT · up to 4 MB'}</small>
            <span className="btn btn--sm btn--light">{file ? 'Replace file' : 'Choose file'}</span>
          </label>
        )}
        <input className="sr-only" id="resume-file" type="file" accept=".pdf,.txt" onChange={(e) => choose(e.target.files?.[0])} disabled={busy} />
        <div className="upload__foot"><span>Your file is only used for this analysis</span><span>{me!.plan.name} plan</span></div>
      </div>

      <div className="card stack">
        <div className="card__title" style={{ margin: 0 }}>
          <h3>Job description <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></h3>
          {!canJd && <span className="chip chip--y">Pro</span>}
        </div>
        {canJd ? (
          <textarea className="textarea" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full job post to get a job-specific match score and missing keywords…" disabled={busy} />
        ) : (
          <p className="muted small">Job-description matching is part of Pro. <Link className="link" to="/app/billing">Upgrade for ₹99</Link></p>
        )}
      </div>

      {err && (
        <div className="form-error row" style={{ justifyContent: 'space-between' }}>
          <span>{err.text}</span>
          {err.upgrade && <Link className="btn btn--sm btn--accent" to="/app/billing">Upgrade</Link>}
        </div>
      )}

      <button className="btn btn--accent" style={{ alignSelf: 'flex-start' }} disabled={!file || busy || outOfFree} onClick={run}>
        {busy ? <><span className="spinner" /> Analyzing…</> : <>Analyze my resume <span className="arrow">→</span></>}
      </button>
    </div>
  );
}
