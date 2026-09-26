import { DragEvent, Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, isUpgradeError } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { ChatPanel } from '../../components/ChatPanel';
import { Empty, Meters, PageError, PageHead, ScoreBadge } from '../../components/Ui';
import { Job, JobForm } from './Jobs';
import { useOrg } from './OrgOverview';

interface Candidate {
  id: string;
  sessionId: string;
  candidateName: string;
  fileName: string;
  score: number;
  categories: { ats: number; impact: number; keywords: number; readability: number };
  strengths: string[];
  gaps: string[];
  missing: string[];
  insights: string;
  screenedBy: string;
  createdAt: string;
}


// One upload request must stay under 4.5 MB (Vercel's body limit) and finish within the function
// time limit, so resumes are sent a few at a time.
const MAX_FILE = 4 * 1024 * 1024;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_FILES = 3;
function batches(files: File[]) {
  const out: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length && (cur.length >= MAX_BATCH_FILES || bytes + f.size > MAX_BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const org = useOrg();
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [results, setResults] = useState<Array<{ fileName: string; ok: boolean; error?: string }>>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [chatFor, setChatFor] = useState<Candidate | null>(null);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['job', id],
    queryFn: async () => (await api.get<{ job: Job; candidates: Candidate[] }>(`/org/jobs/${id}`)).data,
  });

  if (error) return <PageError message={errMsg(error, 'Job not found')} backTo="/org/jobs" backLabel="Back to jobs" />;
  if (isLoading || !data) return <div className="page"><div className="empty"><span className="spinner" /></div></div>;
  const { job, candidates } = data;
  const features = org.data?.plan.features ?? [];
  const shown = candidates.filter((c) => c.score >= filter);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => /\.(pdf|txt)$/i.test(f.name) && f.size <= MAX_FILE);
    if (ok.length < list.length) toast('Skipped files that are not PDF/TXT or are over 4 MB', true);
    setFiles((prev) => [...prev, ...ok].slice(0, 25));
  };

  const screen = async () => {
    setBusy(true);
    setErr(null);
    setResults([]);
    try {
      // Sent in small batches: each request stays under the host's body-size and time limits.
      const all: Array<{ ok: boolean }> = [];
      for (const batch of batches(files)) {
        const fd = new FormData();
        batch.forEach((f) => fd.append('resumes', f));
        const { data } = await api.post(`/org/jobs/${job.id}/screen`, fd, { timeout: 5 * 60 * 1000 });
        all.push(...data.results);
        setResults([...all] as typeof results);
      }
      setFiles([]);
      const okCount = all.filter((r) => r.ok).length;
      toast(`Screened ${okCount} of ${all.length} resumes`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['job', id] }), qc.invalidateQueries({ queryKey: ['org'] }), qc.invalidateQueries({ queryKey: ['jobs'] })]);
    } catch (e) {
      setErr({ text: errMsg(e), upgrade: isUpgradeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get(`/org/jobs/${job.id}/export.csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.title.replace(/[^a-z0-9]+/gi, '-')}-candidates.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(isUpgradeError(e) ? 'CSV export needs the Team plan' : errMsg(e), true);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${job.title}"? Candidate reports stay in your org history.`)) return;
    await api.delete(`/org/jobs/${job.id}`);
    await qc.invalidateQueries({ queryKey: ['jobs'] });
    nav('/org/jobs');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="page">
      <PageHead
        title={job.title}
        sub={<>{candidates.length} candidates · created {fmtDate(job.createdAt)} · <span className={`chip ${job.status === 'open' ? 'chip--g' : 'chip--plain'}`}>{job.status}</span></>}
        actions={
          <>
            <button className="btn btn--light btn--sm" onClick={() => setEditing(true)}>Edit job</button>
            <button className="btn btn--light btn--sm" onClick={exportCsv} disabled={!candidates.length}>Export CSV</button>
            <button className="btn btn--danger btn--sm" onClick={remove}>Delete</button>
          </>
        }
      />

      <div className="grid-3">
        <div className="card card--ink stack">
          <div className="card__title" style={{ margin: 0 }}><h3>Screen applicants</h3><span className="small muted">up to 25 per batch</span></div>
          {features.includes('bulk') ? (
            <>
              <label
                className={`dropzone${over ? ' is-over' : ''}${files.length ? ' has-file' : ''}`}
                htmlFor="bulk-files"
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <span className="drop__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
                </span>
                <strong>{files.length ? `${files.length} resume${files.length > 1 ? 's' : ''} ready` : 'Drop resumes here or browse'}</strong>
                <small className="muted">PDF or TXT · 4 MB each</small>
              </label>
              <input id="bulk-files" className="sr-only" type="file" multiple accept=".pdf,.txt" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} disabled={busy} />
              {files.length > 0 && (
                <div className="row" style={{ gap: 6 }}>
                  {files.map((f, i) => (
                    <span key={i} className="chip chip--plain">
                      {f.name}
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {err && (
                <div className="form-error row" style={{ justifyContent: 'space-between' }}>
                  <span>{err.text}</span>
                  {err.upgrade && <Link className="btn btn--sm btn--accent" to="/org/billing">Upgrade</Link>}
                </div>
              )}
              {results.some((r) => !r.ok) && (
                <div className="form-error">
                  {results.filter((r) => !r.ok).map((r) => <div key={r.fileName}>{r.fileName}: {r.error}</div>)}
                </div>
              )}
              <button className="btn btn--accent" disabled={!files.length || busy} onClick={screen} style={{ alignSelf: 'flex-start' }}>
                {busy ? <><span className="spinner" /> Screening {files.length}… (~10s each)</> : <>Rank {files.length || ''} candidates <span className="arrow">→</span></>}
              </button>
            </>
          ) : (
            <div className="locked">
              <b>Bulk screening is part of the Team plan</b>
              <Link className="btn btn--accent btn--sm" to="/org/billing">Start Team plan →</Link>
            </div>
          )}
        </div>
        <div className="card stack">
          <div className="card__title" style={{ margin: 0 }}><h3>Job description</h3></div>
          <p className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', color: 'var(--muted)' }}>{job.description}</p>
        </div>
      </div>

      <div>
        <div className="card__title">
          <h3>Ranked candidates</h3>
          <label className="row small muted" style={{ gap: 8 }}>
            Min fit
            <select className="select input--sm" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(+e.target.value)}>
              <option value={0}>All</option><option value={50}>50+</option><option value={70}>70+</option><option value={85}>85+</option>
            </select>
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="card"><Empty note={candidates.length ? 'no one above that bar' : 'no candidates yet'}>{candidates.length ? 'Lower the minimum fit filter.' : 'Drop resumes above to rank them against this job.'}</Empty></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Candidate</th><th>Top missing skills</th><th>Screened</th><th className="num">Fit</th><th></th></tr></thead>
              <tbody>
                {shown.map((c, i) => (
                  <Fragment key={c.id}>
                    <tr className="clickable" onClick={() => setOpen(open === c.id ? null : c.id)}>
                      <td><b>{i + 1}</b></td>
                      <td><b>{c.candidateName}</b><div className="small muted">{c.fileName}</div></td>
                      <td><div className="row" style={{ gap: 4 }}>{c.missing.slice(0, 3).map((m) => <span key={m} className="chip chip--p">{m}</span>)}</div></td>
                      <td className="muted small">{fmtDate(c.createdAt)}<br />by {c.screenedBy}</td>
                      <td className="num"><ScoreBadge n={c.score} /></td>
                      <td className="num"><span className="muted">{open === c.id ? '▲' : '▼'}</span></td>
                    </tr>
                    {open === c.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)' }}>
                          <div className="grid-2" style={{ padding: '8px 0' }}>
                            <div className="stack">
                              <Meters c={c.categories} />
                              <p style={{ fontSize: 14 }}>{c.insights}</p>
                              {features.includes('chat') && (
                                <button className="btn btn--sm btn--accent" style={{ alignSelf: 'flex-start' }} onClick={() => setChatFor(c)}>Ask AI about {c.candidateName.split(' ')[0]}</button>
                              )}
                            </div>
                            <div className="stack" style={{ gap: 10, fontSize: 14 }}>
                              <div><b>Strengths</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
                              <div><b>Gaps</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.gaps.map((s) => <li key={s}>{s}</li>)}</ul></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title="Edit job" onClose={() => setEditing(false)}>
          <JobForm
            job={job}
            onDone={async () => {
              await qc.invalidateQueries({ queryKey: ['job', id] });
              setEditing(false);
              toast('Job updated');
            }}
          />
        </Modal>
      )}
      {chatFor && (
        <Modal title={`Ask about ${chatFor.candidateName}`} onClose={() => setChatFor(null)}>
          <ChatPanel sessionId={chatFor.sessionId} enabled />
        </Modal>
      )}
    </div>
  );
}
