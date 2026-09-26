import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, Role } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { PageHead } from '../../components/Ui';

interface AdminUser {
  id: string; name: string; email: string; role: Role; suspended: boolean; createdAt: string; lastLoginAt: string | null;
  org: { id: string; name: string } | null;
  _count: { scans: number };
  subscriptions: Array<{ plan: { name: string; code: string } }>;
}

const roleLabel: Record<Role, string> = { USER: 'User', ORG_ADMIN: 'Org admin', SUPER_ADMIN: 'Super admin' };

export default function AdminUsers() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [granting, setGranting] = useState<AdminUser | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'users', q, role],
    queryFn: async () => (await api.get<AdminUser[]>('/admin/users', { params: { q, role } })).data,
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
      <PageHead title="Users" sub={`${data.length} shown`} />
      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option><option value="USER">Users</option><option value="ORG_ADMIN">Org admins</option><option value="SUPER_ADMIN">Super admins</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Organization</th><th>Role</th><th>Personal plan</th><th className="num">Scans</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8}><div className="empty"><span className="spinner" /></div></td></tr>}
            {data.map((u) => {
              const self = u.id === me!.user.id;
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b><div className="small muted">{u.email}</div></td>
                  <td className="muted">{u.org?.name ?? '–'}</td>
                  <td>
                    {self ? (
                      <span className="chip chip--c">{roleLabel[u.role]}</span>
                    ) : (
                      <select
                        className="select input--sm"
                        style={{ width: 'auto' }}
                        value={u.role}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === 'SUPER_ADMIN' && !window.confirm(`Give ${u.email} full super admin access?`)) return;
                          act(() => api.patch(`/admin/users/${u.id}`, { role: next }), 'Role updated');
                        }}
                      >
                        <option value="USER">User</option>
                        <option value="ORG_ADMIN" disabled={!u.org}>Org admin</option>
                        <option value="SUPER_ADMIN">Super admin</option>
                      </select>
                    )}
                  </td>
                  <td>{u.subscriptions.length ? u.subscriptions.map((s) => <span key={s.plan.code} className="chip chip--g">{s.plan.name}</span>) : <span className="muted">Free</span>}</td>
                  <td className="num">{u._count.scans}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                  <td>{u.suspended ? <span className="chip chip--c">Suspended</span> : <span className="chip chip--g">Active</span>}</td>
                  <td className="num">
                    {!self && (
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn btn--light btn--sm" onClick={() => setGranting(u)}>Grant Pro</button>
                        <button
                          className={`btn btn--sm ${u.suspended ? 'btn--light' : 'btn--danger'}`}
                          onClick={() => act(() => api.patch(`/admin/users/${u.id}`, { suspended: !u.suspended }), u.suspended ? 'User reactivated' : 'User suspended')}
                        >
                          {u.suspended ? 'Reactivate' : 'Suspend'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {granting && (
        <Modal title={`Grant Pro to ${granting.name}`} onClose={() => setGranting(null)}>
          <GrantForm
            planOptions={[['pro', 'Pro']]}
            onSubmit={async (planCode, months) => {
              await act(() => api.post(`/admin/users/${granting.id}/grant`, { planCode, months }), 'Plan granted');
              setGranting(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

export function GrantForm({ planOptions, onSubmit }: { planOptions: Array<[string, string]>; onSubmit: (planCode: string, months?: number) => Promise<void> }) {
  const [plan, setPlan] = useState(planOptions[0][0]);
  const [months, setMonths] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(plan, months ? +months : undefined);
        setBusy(false);
      }}
    >
      <p className="muted small">Complimentary access, no payment recorded. Replaces any currently active plan.</p>
      <label className="field"><span>Plan</span>
        <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {planOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="field"><span>Duration in months (empty = no expiry)</span>
        <input className="input" type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value)} />
      </label>
      <button className="btn btn--accent" disabled={busy}>{busy && <span className="spinner" />} Grant plan</button>
    </form>
  );
}
