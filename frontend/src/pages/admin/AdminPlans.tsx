import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, inr, Plan } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { PageHead } from '../../components/Ui';

const limitLabel = (v: number | null) => (v === null ? '∞' : v);
const toLimit = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === '' ? null : Number(v));

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr('');
    try {
      await api.put(`/admin/plans/${plan.id}`, {
        name: f.get('name'),
        tagline: f.get('tagline'),
        priceInr: Number(f.get('priceInr')),
        yearlyPriceInr: toLimit(f.get('yearlyPriceInr')),
        highlight: f.get('highlight') === 'on',
        active: f.get('active') === 'on',
        bullets: String(f.get('bullets')).split('\n').map((s) => s.trim()).filter(Boolean),
        limits: {
          scansTotal: toLimit(f.get('scansTotal')),
          scansPerMonth: toLimit(f.get('scansPerMonth')),
          seats: toLimit(f.get('seats')),
          bulkPerMonth: toLimit(f.get('bulkPerMonth')),
          ...(plan.code === 'team' && { seatPriceInr: Number(f.get('seatPriceInr') || 0) }),
        },
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const L = plan.limits;
  return (
    <form className="stack" onSubmit={submit}>
      {err && <div className="form-error">{err}</div>}
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Name</span><input className="input" name="name" defaultValue={plan.name} required /></label>
        <label className="field"><span>Price (₹)</span><input className="input" name="priceInr" type="number" min={0} defaultValue={plan.priceInr} disabled={plan.interval === 'FREE' || plan.interval === 'CUSTOM'} /></label>
      </div>
      <label className="field"><span>Tagline</span><input className="input" name="tagline" defaultValue={plan.tagline} /></label>
      {plan.interval === 'MONTHLY' && (
        <label className="field"><span>Yearly price (₹)</span><input className="input" name="yearlyPriceInr" type="number" min={0} defaultValue={plan.yearlyPriceInr ?? ''} /></label>
      )}
      <p className="small muted">Limits: leave empty for unlimited.</p>
      <div className="grid-2" style={{ gap: 12 }}>
        <label className="field"><span>Scans (lifetime)</span><input className="input" name="scansTotal" type="number" min={0} defaultValue={L.scansTotal ?? ''} /></label>
        <label className="field"><span>Scans / month</span><input className="input" name="scansPerMonth" type="number" min={0} defaultValue={L.scansPerMonth ?? ''} /></label>
        <label className="field"><span>Seats</span><input className="input" name="seats" type="number" min={1} defaultValue={L.seats ?? ''} /></label>
        <label className="field"><span>Bulk resumes / month</span><input className="input" name="bulkPerMonth" type="number" min={0} defaultValue={L.bulkPerMonth ?? ''} /></label>
        {plan.code === 'team' && <label className="field"><span>Extra seat price (₹)</span><input className="input" name="seatPriceInr" type="number" min={0} defaultValue={L.seatPriceInr ?? 499} /></label>}
      </div>
      <label className="field">
        <span>Pricing card bullets (one per line, prefix ! for a crossed-out item)</span>
        <textarea className="textarea" name="bullets" defaultValue={plan.bullets.join('\n')} />
      </label>
      <div className="row">
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="highlight" defaultChecked={plan.highlight} /> Highlight as "Most picked"</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" name="active" defaultChecked={plan.active} /> Visible on pricing page</label>
      </div>
      <button className="btn btn--accent" disabled={busy}>{busy && <span className="spinner" />} Save plan</button>
    </form>
  );
}

export default function AdminPlans() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Plan | null>(null);
  const { data = [] } = useQuery({ queryKey: ['admin', 'plans'], queryFn: async () => (await api.get<Plan[]>('/admin/plans')).data });

  return (
    <div className="page">
      <PageHead title="Plans & pricing" sub="Changes apply immediately to the public pricing page and to plan limits." />
      <div className="plans plans--4">
        {data.map((p) => (
          <div key={p.id} className={`plan${p.highlight ? ' plan--hot' : ''}`} style={{ opacity: p.active ? 1 : 0.55 }}>
            <div className="plan__top"><b>{p.name}</b><span className="chip chip--plain">{p.code}</span></div>
            <span className="plan__price plan__price--sm">
              {p.interval === 'CUSTOM' ? 'Custom' : inr(p.priceInr)}{' '}
              <small>{p.interval === 'MONTHLY' ? '/ mo' : p.interval === 'ONE_TIME' ? 'one time' : ''}</small>
            </span>
            <ul>
              <li>Scans: {limitLabel(p.limits.scansTotal)} lifetime · {limitLabel(p.limits.scansPerMonth)} / mo</li>
              <li>Seats: {limitLabel(p.limits.seats)}</li>
              <li>Bulk: {limitLabel(p.limits.bulkPerMonth)} / mo</li>
              <li>Features: {p.features.length ? p.features.join(', ') : 'basic'}</li>
            </ul>
            <button className="btn btn--light" onClick={() => setEditing(p)}>Edit plan</button>
          </div>
        ))}
      </div>
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <PlanEditor
            plan={editing}
            onSaved={async () => {
              await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'plans'] }), qc.invalidateQueries({ queryKey: ['plans'] })]);
              setEditing(null);
              toast('Plan saved');
            }}
          />
        </Modal>
      )}
    </div>
  );
}
