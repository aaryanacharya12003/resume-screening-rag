import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errMsg, inr, Plan } from '../lib/api';
import { useAuth } from '../lib/auth';
import { checkout } from '../lib/checkout';
import { useToast } from './Toast';

export const usePlans = () =>
  useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.get<{ plans: Plan[]; devCheckout: boolean }>('/billing/plans')).data,
    staleTime: 60_000,
  });

function priceFor(p: Plan, cycle: 'monthly' | 'yearly') {
  if (p.interval === 'CUSTOM') return { main: 'Custom', sub: 'talk to sales' };
  if (p.interval === 'FREE') return { main: '₹0', sub: 'forever' };
  if (p.interval === 'ONE_TIME') return { main: inr(p.priceInr), sub: 'one time' };
  if (cycle === 'yearly' && p.yearlyPriceInr) return { main: inr(p.yearlyPriceInr), sub: '/ year' };
  return { main: inr(p.priceInr), sub: '/ month' };
}

export function PricingPlans() {
  const { data, isLoading } = usePlans();
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading || !data) return <div className="empty"><span className="spinner" /></div>;

  const buy = async (p: Plan) => {
    if (p.code === 'free') return nav(me ? '/app/scan' : '/register');
    if (p.code === 'enterprise') return document.getElementById('enterprise')?.scrollIntoView({ behavior: 'smooth' });
    if (!me) return nav(p.code === 'team' ? '/register?type=team' : '/register?next=/app/billing');
    if (p.code === 'team' && me.user.role !== 'ORG_ADMIN') {
      toast('Team plans are bought by an organization admin. Create a team account to continue.', true);
      return;
    }
    setBusy(p.code);
    try {
      const ok = await checkout({ planCode: p.code as 'pro' | 'team', cycle });
      if (ok) {
        await refresh();
        toast(`You're on ${p.name} now 🎉`);
        nav(p.code === 'team' ? '/org' : '/app');
      }
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      setBusy(null);
    }
  };

  const current = me?.plan.code;
  const hasYearly = data.plans.some((p) => p.yearlyPriceInr);

  return (
    <>
      {hasYearly && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="seg cycle" role="group" aria-label="Billing cycle">
            <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
            <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly · 2 months free</button>
          </div>
        </div>
      )}
      <div className="plans plans--4">
        {data.plans.map((p) => {
          const price = priceFor(p, cycle);
          const dark = p.code === 'enterprise';
          const isCurrent = current === p.code;
          return (
            <div key={p.id} className={`plan${p.highlight ? ' plan--hot' : ''}${dark ? ' plan--dark' : ''}`}>
              <div className="plan__top">
                <b>{p.name}</b>
                {p.highlight && <span className="pill pill--good">Most picked</span>}
                {p.audience === 'team' && !dark && <span className="chip chip--b">Teams</span>}
              </div>
              <span className={`plan__price${price.main.length >= 6 ? ' plan__price--sm' : ''}`}>
                {price.main} <small>{price.sub}</small>
              </span>
              <p>{p.tagline}</p>
              <ul>
                {p.bullets.map((b) =>
                  b.startsWith('!') ? <li key={b} className="off">{b.slice(1)}</li> : <li key={b}>{b}</li>,
                )}
              </ul>
              <button
                className={`btn ${p.highlight ? 'btn--accent' : dark ? 'btn--hot' : 'btn--light'}`}
                disabled={busy !== null || (isCurrent && p.code !== 'team')}
                onClick={() => buy(p)}
              >
                {busy === p.code ? <span className="spinner" /> : null}
                {isCurrent && p.code !== 'team'
                  ? 'Current plan'
                  : p.code === 'free'
                    ? 'Get my free score'
                    : p.code === 'pro'
                      ? 'Unlock everything →'
                      : p.code === 'team'
                        ? isCurrent ? 'Renew / extend' : 'Start Team plan'
                        : 'Contact sales'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

const ROWS: Array<[string, (p: Plan) => string | boolean]> = [
  ['Resume scans', (p) => (p.limits.scansTotal === null ? 'Unlimited' : `${p.limits.scansTotal}`)],
  ['Recruiter seats', (p) => (p.limits.seats === null ? 'Unlimited' : `${p.limits.seats}`)],
  ['Bulk screening / month', (p) => (p.limits.bulkPerMonth === null ? 'Unlimited' : p.limits.bulkPerMonth ? `${p.limits.bulkPerMonth}` : false)],
  ['Full 30+ check report', (p) => p.features.includes('fullReport')],
  ['Job-description matching', (p) => p.features.includes('jdMatch')],
  ['Bullet rewrites', (p) => p.features.includes('rewrites')],
  ['AI recruiter chat (RAG)', (p) => p.features.includes('chat')],
  ['Jobs + candidate ranking', (p) => p.features.includes('bulk')],
  ['CSV export', (p) => p.features.includes('export')],
  ['API access', (p) => p.features.includes('api')],
  ['SSO / SAML', (p) => p.features.includes('sso')],
  ['White-label reports', (p) => p.features.includes('whiteLabel')],
];

export function CompareTable() {
  const { data } = usePlans();
  if (!data) return null;
  return (
    <div className="table-wrap">
      <table className="table compare-table">
        <thead>
          <tr><th>Feature</th>{data.plans.map((p) => <th key={p.id} style={{ textAlign: 'center' }}>{p.name}</th>)}</tr>
        </thead>
        <tbody>
          {ROWS.map(([label, fn]) => (
            <tr key={label}>
              <td>{label}</td>
              {data.plans.map((p) => {
                const v = fn(p);
                return <td key={p.id}>{v === true ? <span className="yes">✓</span> : v === false ? <span className="no">–</span> : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContactSales() {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setErr('');
    try {
      await api.post('/billing/contact-sales', { ...f, seats: f.seats || undefined });
      setSent(true);
      toast('Thanks! Our team will reach out within one business day.');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="card card--panel" style={{ textAlign: 'center', padding: 40 }}>
        <span className="hand" style={{ fontSize: 30, color: 'var(--accent)' }}>got it!</span>
        <p style={{ marginTop: 8 }}>We'll get back to you within one business day.</p>
      </div>
    );
  }

  return (
    <form className="card card--ink stack" onSubmit={submit}>
      {err && <div className="form-error">{err}</div>}
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      <div className="grid-2" style={{ gap: 14 }}>
        <label className="field"><span>Your name</span><input className="input" name="name" required /></label>
        <label className="field"><span>Work email</span><input className="input" name="email" type="email" required /></label>
        <label className="field"><span>Company</span><input className="input" name="company" required /></label>
        <label className="field"><span>Recruiter seats</span><input className="input" name="seats" type="number" min={1} placeholder="e.g. 25" /></label>
      </div>
      <label className="field"><span>What do you need?</span><textarea className="textarea" name="message" placeholder="Hiring volume, ATS integrations, SSO, security review…" /></label>
      <button className="btn btn--accent" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy && <span className="spinner" />} Talk to sales <span className="arrow">→</span>
      </button>
    </form>
  );
}
