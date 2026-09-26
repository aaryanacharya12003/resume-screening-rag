import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errMsg, fmtDate, PlanLimits } from '../../lib/api';
import { Empty, PageError, PageHead, ScoreBadge, Stat } from '../../components/Ui';

export interface OrgOverview {
  org: { id: string; name: string; slug: string; createdAt: string };
  seats: { total: number | null; used: number; pending: number };
  plan: { code: string; name: string; limits: PlanLimits; features: string[]; periodEnd: string | null };
  usage: { scansThisMonth: number; bulkThisMonth: number; openJobs: number };
  recent: Array<{ id: string; candidateName: string | null; fileName: string; score: number; by: string; job: string | null; createdAt: string }>;
}

export const useOrg = () => useQuery({ queryKey: ['org'], queryFn: async () => (await api.get<OrgOverview>('/org')).data });

export default function OrgOverviewPage() {
  const { data, isLoading, error } = useOrg();
  const nav = useNavigate();
  if (error) return <PageError message={errMsg(error, 'Could not load your organization')} backTo="/app" backLabel="My workspace" />;
  if (isLoading || !data) return <div className="page"><div className="empty"><span className="spinner" /></div></div>;
  const { plan, seats, usage } = data;
  const isTeam = plan.features.includes('bulk');
  const bulkLimit = plan.limits.bulkPerMonth;

  return (
    <div className="page">
      <PageHead
        title={<>{data.org.name} <span className="mark blue">hiring HQ</span></>}
        sub={`${plan.name} plan${plan.periodEnd ? ` · renews ${fmtDate(plan.periodEnd)}` : ''}`}
        actions={<Link className="btn btn--accent" to="/org/jobs">Screen candidates →</Link>}
      />

      {!isTeam && (
        <div className="locked">
          <span className="hand" style={{ fontSize: 26, color: 'var(--hot)' }}>one step left</span>
          <b style={{ fontSize: 18 }}>Activate the Team plan to screen candidates in bulk</b>
          <span className="muted">5 recruiter seats, job postings, 500 ranked resumes a month and CSV export for ₹2,999/month.</span>
          <Link className="btn btn--accent" to="/org/billing">Start Team plan →</Link>
        </div>
      )}

      <div className="stats">
        <Stat k="Seats" v={`${seats.used}${seats.total === null ? '' : ` / ${seats.total}`}`} s={seats.pending ? `${seats.pending} invite(s) pending` : seats.total === null ? 'Unlimited' : 'in use'} color="var(--accent)" />
        <Stat k="Resumes screened" v={usage.bulkThisMonth} s={bulkLimit === null ? 'this month · unlimited' : `of ${bulkLimit} this month`} color="var(--blue)" />
        <Stat k="All scans" v={usage.scansThisMonth} s="this month, all members" color="var(--pink)" />
        <Stat k="Open jobs" v={usage.openJobs} s={<Link className="link" to="/org/jobs">Manage jobs</Link>} color="var(--green)" />
      </div>

      {bulkLimit !== null && bulkLimit > 0 && (
        <div className="card">
          <div className="card__title"><h3>Monthly screening quota</h3><span className="small muted">{usage.bulkThisMonth} / {bulkLimit}</span></div>
          <div className="meter" style={{ gridTemplateColumns: '1fr' }}>
            <div className="track" style={{ height: 14 }}>
              <span style={{ width: `${Math.min(100, (usage.bulkThisMonth / bulkLimit) * 100)}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="card__title"><h3>Recent activity</h3></div>
        {data.recent.length === 0 ? (
          <div className="card"><Empty note="quiet in here">Create a job and drop in resumes to rank candidates.</Empty></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Candidate</th><th>Job</th><th>By</th><th>Date</th><th className="num">Score</th></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.candidateName || r.fileName}</b></td>
                    <td className="muted">{r.job ?? 'Personal scan'}</td>
                    <td className="muted">{r.by}</td>
                    <td className="muted">{fmtDate(r.createdAt)}</td>
                    <td className="num"><ScoreBadge n={r.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/org/team')}>Manage team & seats →</button>
    </div>
  );
}
