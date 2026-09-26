import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reconcilePayments } from '../../lib/checkout';
import { api, fmtDate, inr } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PricingPlans } from '../../components/Pricing';
import { PageHead } from '../../components/Ui';

export interface PaymentRow {
  id: string;
  amountInr: number;
  status: string;
  cycle: string;
  createdAt: string;
  razorpayPaymentId: string | null;
  plan: { name: string; code: string };
}

export function usePaymentHistory() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      // Settle any payment whose confirmation got lost (tab closed mid-checkout) before listing.
      const activated = await reconcilePayments().catch(() => 0);
      if (activated) qc.invalidateQueries({ queryKey: ['me'] });
      return (await api.get<PaymentRow[]>('/billing/history')).data;
    },
  });
}

export function PaymentHistory() {
  const { data = [] } = usePaymentHistory();
  if (!data.length) return <p className="muted small">No payments yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Date</th><th>Plan</th><th>Cycle</th><th>Status</th><th>Reference</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id}>
              <td>{fmtDate(p.createdAt)}</td>
              <td><b>{p.plan.name}</b></td>
              <td className="muted">{p.cycle.startsWith('seats:') ? `${p.cycle.split(':')[1]} extra seats` : p.cycle.replace('_', ' ')}</td>
              <td><span className={`chip ${p.status === 'PAID' ? 'chip--g' : p.status === 'REFUNDED' ? 'chip--b' : 'chip--c'}`}>{p.status.toLowerCase()}</span></td>
              <td className="muted small">{p.razorpayPaymentId ?? '–'}</td>
              <td className="num">{inr(p.amountInr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Billing() {
  const { me } = useAuth();
  const plan = me!.plan;
  return (
    <div className="page">
      <PageHead title="Plan & billing" sub="Payments are processed securely by Razorpay (UPI, cards, netbanking)." />
      <div className="card card--panel row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="eyebrow" style={{ color: 'rgba(245,246,252,.65)' }}>Current plan</p>
          <b style={{ font: '500 34px var(--display)' }}>{plan.name}</b>
          <span style={{ opacity: 0.8, fontSize: 14 }}>
            {plan.source === 'org' ? `Provided by ${me!.org?.name}` : plan.code === 'free' ? '1 free scan · score + top 3 issues' : plan.code === 'pro' ? 'Lifetime access · unlimited scans' : 'All features'}
            {plan.periodEnd && ` · renews ${fmtDate(plan.periodEnd)}`}
          </span>
        </div>
        <div className="stack" style={{ gap: 4, textAlign: 'right' }}>
          <span className="small" style={{ opacity: 0.7 }}>Scans this month</span>
          <b style={{ font: '500 34px var(--display)' }}>{me!.usage.scansThisMonth}</b>
        </div>
      </div>
      <PricingPlans />
      <div>
        <div className="card__title"><h3>Payment history</h3></div>
        <PaymentHistory />
      </div>
    </div>
  );
}
