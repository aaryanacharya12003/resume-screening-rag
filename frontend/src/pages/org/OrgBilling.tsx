import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errMsg, fmtDate, inr } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { checkout } from '../../lib/checkout';
import { useToast } from '../../components/Toast';
import { ContactSales, usePlans } from '../../components/Pricing';
import { PageError, PageHead, Stat } from '../../components/Ui';
import { PaymentHistory } from '../app/Billing';
import { useOrg } from './OrgOverview';

export default function OrgBilling() {
  const { data: org, error: orgError } = useOrg();
  const { data: plansData, error: plansError } = usePlans();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const team = plansData?.plans.find((p) => p.code === 'team');
  if (orgError || plansError) return <PageError message={errMsg(orgError || plansError, 'Could not load billing')} backTo="/org" backLabel="Overview" />;
  if (!org || !team) return <div className="page"><div className="empty"><span className="spinner" /></div></div>;
  const onTeam = org.plan.code === 'team';
  const onEnterprise = org.plan.code === 'enterprise';
  const seatPrice = team.limits.seatPriceInr ?? 499;

  const pay = async (key: string, input: Parameters<typeof checkout>[0], ok: string) => {
    setBusy(key);
    try {
      if (await checkout(input)) {
        await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['org'] }), qc.invalidateQueries({ queryKey: ['payments'] }), qc.invalidateQueries({ queryKey: ['team'] })]);
        toast(ok);
      }
    } catch (e) {
      toast(errMsg(e), true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <PageHead title="Team billing" sub="Team plans are prepaid monthly or yearly through Razorpay. Pay again any time to extend." />

      <div className="stats">
        <Stat k="Plan" v={<span style={{ fontSize: 30 }}>{org.plan.name}</span>} s={org.plan.periodEnd ? `active until ${fmtDate(org.plan.periodEnd)}` : onEnterprise ? 'custom contract' : 'not active'} color="var(--accent)" />
        <Stat k="Seats" v={`${org.seats.used} / ${org.seats.total ?? '∞'}`} s="members in use" color="var(--blue)" />
        <Stat k="Screened this month" v={org.usage.bulkThisMonth} s={org.plan.limits.bulkPerMonth === null ? 'unlimited' : `of ${org.plan.limits.bulkPerMonth}`} color="var(--pink)" />
      </div>

      {!onEnterprise && (
        <div className="grid-2">
          <div className={`plan ${onTeam ? '' : 'plan--hot'}`}>
            <div className="plan__top"><b>{team.name}</b>{onTeam && <span className="pill pill--good">Active</span>}</div>
            <div className="seg" role="group" aria-label="Billing cycle">
              <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</button>
              <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly · save 17%</button>
            </div>
            <span className="plan__price">
              {inr(cycle === 'yearly' ? team.yearlyPriceInr ?? team.priceInr * 10 : team.priceInr)} <small>/ {cycle === 'yearly' ? 'year' : 'month'}</small>
            </span>
            <ul>{team.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            <button className="btn btn--accent" disabled={busy !== null} onClick={() => pay('team', { planCode: 'team', cycle }, `Team plan ${onTeam ? 'extended' : 'activated'} 🎉`)}>
              {busy === 'team' && <span className="spinner" />}
              {onTeam ? `Extend by one ${cycle === 'yearly' ? 'year' : 'month'}` : 'Start Team plan →'}
            </button>
          </div>

          <div className="plan">
            <div className="plan__top"><b>Extra seats</b><span className="chip chip--b">{inr(seatPrice)} / seat</span></div>
            <p>Add recruiters beyond the 5 included seats. Seats stay on your workspace.</p>
            <label className="field">
              <span>How many seats?</span>
              <input className="input" type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(Math.max(1, +e.target.value || 1))} />
            </label>
            <span className="plan__price plan__price--sm">{inr(seats * seatPrice)}</span>
            <button className="btn btn--light" disabled={busy !== null || !onTeam} onClick={() => pay('seats', { planCode: 'seats', seats }, `${seats} seat(s) added`)}>
              {busy === 'seats' && <span className="spinner" />}
              {onTeam ? `Buy ${seats} seat${seats > 1 ? 's' : ''}` : 'Activate Team first'}
            </button>
          </div>
        </div>
      )}

      <div className="grid-2" id="enterprise">
        <div className="stack">
          <p className="eyebrow">Enterprise</p>
          <h2 className="display h3">Need unlimited seats, SSO or an API?</h2>
          <p className="muted">Tell us about your hiring volume and we'll set up a custom Enterprise plan for {org.org.name}.</p>
        </div>
        <ContactSales />
      </div>

      <div>
        <div className="card__title"><h3>Payment history</h3></div>
        <PaymentHistory />
      </div>
    </div>
  );
}
