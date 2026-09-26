import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { Empty, PageHead, ScoreBadge } from '../../components/Ui';
import { useOrg } from './OrgOverview';

export interface Job { id: string; title: string; description: string; status: 'open' | 'closed'; createdAt: string }
interface JobRow extends Job { candidates: number; avgScore: number; topScore: number }

export function JobForm({ job, onDone }: { job?: Job; onDone: (j: Job) => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setErr('');
    try {
      const { data } = job ? await api.patch<Job>(`/org/jobs/${job.id}`, f) : await api.post<Job>('/org/jobs', f);
      onDone(data);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit}>
      {err && <div className="form-error">{err}</div>}
      <label className="field"><span>Job title</span><input className="input" name="title" defaultValue={job?.title} required autoFocus /></label>
      <label className="field">
        <span>Job description</span>
        <textarea className="textarea" name="description" defaultValue={job?.description} required style={{ minHeight: 220 }} placeholder="Paste the full job post: responsibilities, must-have skills, nice-to-haves…" />
      </label>
      {job && (
        <label className="field">
          <span>Status</span>
          <select className="select" name="status" defaultValue={job.status}><option value="open">Open</option><option value="closed">Closed</option></select>
        </label>
      )}
      <button className="btn btn--accent" disabled={busy}>{busy && <span className="spinner" />}{job ? 'Save changes' : 'Create job'}</button>
    </form>
  );
}

export default function Jobs() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const org = useOrg();
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['jobs'], queryFn: async () => (await api.get<JobRow[]>('/org/jobs')).data });
  const canBulk = org.data?.plan.features.includes('bulk');

  return (
    <div className="page">
      <PageHead
        title="Jobs & screening"
        sub="Create a job, drop in applicant resumes, and get a ranked shortlist."
        actions={<button className="btn btn--accent" onClick={() => setCreating(true)}>New job</button>}
      />
      {org.data && !canBulk && (
        <div className="form-error row" style={{ justifyContent: 'space-between', background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>
          <span>Bulk screening needs the Team plan. You can still create jobs now.</span>
          <Link className="btn btn--sm btn--accent" to="/org/billing">Start Team plan</Link>
        </div>
      )}
      {isLoading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : jobs.length === 0 ? (
        <div className="card"><Empty note="no jobs yet">Create your first job to start ranking candidates.<button className="btn btn--sm" onClick={() => setCreating(true)}>New job</button></Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Job</th><th>Status</th><th>Created</th><th className="num">Candidates</th><th className="num">Avg fit</th><th className="num">Top fit</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="clickable" onClick={() => nav(`/org/jobs/${j.id}`)}>
                  <td><b>{j.title}</b></td>
                  <td><span className={`chip ${j.status === 'open' ? 'chip--g' : 'chip--plain'}`}>{j.status}</span></td>
                  <td className="muted">{fmtDate(j.createdAt)}</td>
                  <td className="num">{j.candidates}</td>
                  <td className="num">{j.candidates ? <ScoreBadge n={j.avgScore} /> : '–'}</td>
                  <td className="num">{j.candidates ? <ScoreBadge n={j.topScore} /> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <Modal title="New job" onClose={() => setCreating(false)}>
          <JobForm
            onDone={async (j) => {
              await qc.invalidateQueries({ queryKey: ['jobs'] });
              toast('Job created');
              nav(`/org/jobs/${j.id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
