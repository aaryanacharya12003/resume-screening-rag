import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, inr } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { Empty, PageHead } from '../../components/Ui';

interface AdminPayment {
  id: string; amountInr: number; status: string; cycle: string; createdAt: string;
  razorpayOrderId: string | null; razorpayPaymentId: string | null;
  plan: { name: string }; user: { email: string; name: string }; org: { name: string } | null;
}

const statusChip: Record<string, string> = { PAID: 'chip--g', CREATED: 'chip--plain', FAILED: 'chip--c', REFUNDED: 'chip--b' };

export function AdminPayments() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data = [], isLoading } = useQuery({ queryKey: ['admin', 'payments'], queryFn: async () => (await api.get<AdminPayment[]>('/admin/payments')).data });
  const paid = data.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amountInr, 0);

  const refund = async (p: AdminPayment) => {
    if (!window.confirm(`Refund ${inr(p.amountInr)} to ${p.user.email}? This calls Razorpay and cannot be undone.`)) return;
    try {
      await api.post(`/admin/payments/${p.id}/refund`);
      await qc.invalidateQueries({ queryKey: ['admin'] });
      toast('Refund issued');
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  return (
    <div className="page">
      <PageHead title="Payments" sub={`${inr(paid)} collected across ${data.filter((p) => p.status === 'PAID').length} paid orders`} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>Customer</th><th>Plan</th><th>Status</th><th>Razorpay</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7}><div className="empty"><span className="spinner" /></div></td></tr>}
            {data.map((p) => (
              <tr key={p.id}>
                <td className="muted">{fmtDate(p.createdAt)}</td>
                <td><b>{p.user.name}</b><div className="small muted">{p.user.email}{p.org ? ` · ${p.org.name}` : ''}</div></td>
                <td>{p.plan.name}<div className="small muted">{p.cycle.startsWith('seats:') ? `${p.cycle.split(':')[1]} seats` : p.cycle.replace('_', ' ')}</div></td>
                <td><span className={`chip ${statusChip[p.status] ?? 'chip--plain'}`}>{p.status.toLowerCase()}</span></td>
                <td className="small muted">{p.razorpayPaymentId ?? p.razorpayOrderId ?? '–'}</td>
                <td className="num"><b>{inr(p.amountInr)}</b></td>
                <td className="num">{p.status === 'PAID' && <button className="btn btn--danger btn--sm" onClick={() => refund(p)}>Refund</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Lead { id: string; name: string; email: string; company: string; seats: number | null; message: string | null; status: string; createdAt: string }

export function AdminLeads() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data = [], isLoading } = useQuery({ queryKey: ['admin', 'leads'], queryFn: async () => (await api.get<Lead[]>('/admin/leads')).data });
  const setStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/admin/leads/${id}`, { status });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast(errMsg(e), true);
    }
  };
  return (
    <div className="page">
      <PageHead title="Enterprise leads" sub="Requests from the Contact sales form." />
      {!isLoading && data.length === 0 ? (
        <div className="card"><Empty note="no leads yet">They'll show up here when someone fills in the Enterprise form.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Received</th><th>Contact</th><th>Company</th><th className="num">Seats</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <td className="muted">{fmtDate(l.createdAt)}</td>
                  <td><b>{l.name}</b><div className="small"><a className="link" href={`mailto:${l.email}`}>{l.email}</a></div></td>
                  <td>{l.company}</td>
                  <td className="num">{l.seats ?? '–'}</td>
                  <td className="small muted" style={{ maxWidth: 320 }}>{l.message ?? '–'}</td>
                  <td>
                    <select className="select input--sm" style={{ width: 'auto' }} value={l.status} onChange={(e) => setStatus(l.id, e.target.value)}>
                      <option value="new">New</option><option value="contacted">Contacted</option><option value="won">Won</option><option value="lost">Lost</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Log { id: string; action: string; target: string | null; meta: Record<string, unknown> | null; createdAt: string; actor: { email: string } | null }

export function AdminAudit() {
  const { data = [], isLoading } = useQuery({ queryKey: ['admin', 'audit'], queryFn: async () => (await api.get<Log[]>('/admin/audit')).data });
  return (
    <div className="page">
      <PageHead title="Audit log" sub="Sign-ups, payments, role changes and admin actions (latest 300)." />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5}><div className="empty"><span className="spinner" /></div></td></tr>}
            {data.map((l) => (
              <tr key={l.id}>
                <td className="muted small">{new Date(l.createdAt).toLocaleString('en-IN')}</td>
                <td>{l.actor?.email ?? 'system'}</td>
                <td><span className="chip chip--plain">{l.action}</span></td>
                <td className="small">{l.target ?? '–'}</td>
                <td className="small muted" style={{ maxWidth: 360, wordBreak: 'break-word' }}>{l.meta ? JSON.stringify(l.meta) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
