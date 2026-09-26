import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { PageHead } from '../../components/Ui';
import { GrantForm } from './AdminUsers';

interface AdminOrg {
  id: string; name: string; slug: string; suspended: boolean; extraSeats: number; createdAt: string;
  _count: { members: number; scans: number; jobs: number };
  subscriptions: Array<{ id: string; periodEnd: string | null; plan: { name: string; code: string } }>;
  members: Array<{ email: string }>;
}

export default function AdminOrgs() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [granting, setGranting] = useState<AdminOrg | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'orgs', q],
    queryFn: async () => (await api.get<AdminOrg[]>('/admin/orgs', { params: { q } })).data,
  });

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin'] });
      toast(ok);
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  return (
    <div className="page">
      <PageHead title="Organizations" sub={`${data.length} workspaces`} />
      <input className="input" style={{ maxWidth: 320 }} placeholder="Search organizations…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Organization</th><th>Plan</th><th className="num">Members</th><th className="num">Extra seats</th><th className="num">Jobs</th><th className="num">Scans</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8}><div className="empty"><span className="spinner" /></div></td></tr>}
            {data.map((o) => {
              const sub = o.subscriptions[0];
              return (
                <tr key={o.id}>
                  <td>
                    <b>{o.name}</b> {o.suspended && <span className="chip chip--c">Suspended</span>}
                    <div className="small muted">{o.members[0]?.email ?? 'no admin'}</div>
                  </td>
                  <td>
                    {sub ? <span className="chip chip--g">{sub.plan.name}</span> : <span className="muted">No plan</span>}
                    {sub?.periodEnd && <div className="small muted">until {fmtDate(sub.periodEnd)}</div>}
                  </td>
                  <td className="num">{o._count.members}</td>
                  <td className="num">
                    <input
                      className="input input--sm"
                      type="number"
                      min={0}
                      defaultValue={o.extraSeats}
                      style={{ width: 70, textAlign: 'right' }}
                      onBlur={(e) => +e.target.value !== o.extraSeats && act(() => api.patch(`/admin/orgs/${o.id}`, { extraSeats: +e.target.value }), 'Seats updated')}
                      aria-label={`Extra seats for ${o.name}`}
                    />
                  </td>
                  <td className="num">{o._count.jobs}</td>
                  <td className="num">{o._count.scans}</td>
                  <td className="muted">{fmtDate(o.createdAt)}</td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn btn--light btn--sm" onClick={() => setGranting(o)}>Set plan</button>
                      <button
                        className={`btn btn--sm ${o.suspended ? 'btn--light' : 'btn--danger'}`}
                        onClick={() =>
                          (o.suspended || window.confirm(`Suspend ${o.name}? All its members lose access.`)) &&
                          act(() => api.patch(`/admin/orgs/${o.id}`, { suspended: !o.suspended }), o.suspended ? 'Organization reactivated' : 'Organization suspended')
                        }
                      >
                        {o.suspended ? 'Reactivate' : 'Suspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {granting && (
        <Modal title={`Set plan for ${granting.name}`} onClose={() => setGranting(null)}>
          <GrantForm
            planOptions={[['enterprise', 'Enterprise'], ['team', 'Team']]}
            onSubmit={async (planCode, months) => {
              await act(() => api.post(`/admin/orgs/${granting.id}/grant`, { planCode, months }), 'Plan updated');
              setGranting(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
