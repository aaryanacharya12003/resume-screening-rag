import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errMsg, inr } from '../../lib/api';
import { PageError, PageHead, Stat } from '../../components/Ui';

interface Stats {
  totals: { users: number; orgs: number; scans: number; revenueInr: number; revenue30dInr: number; mrrInr: number; paying: number; leadsNew: number };
  planMix: Array<{ name: string; count: number }>;
  series: Record<'scans' | 'revenue' | 'signups', Array<{ date: string; value: number }>>;
}

const short = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function MiniBars({ data, color, money }: { data: Array<{ date: string; value: number }>; color: string; money?: boolean }) {
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 6, left: money ? 4 : -22, bottom: 0 }}>
          <CartesianGrid stroke="#DFE3F1" vertical={false} />
          <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 11 }} stroke="#A2A6C4" interval={6} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#A2A6C4" tickFormatter={(v) => (money ? inr(v) : v)} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,.04)' }}
            contentStyle={{ border: '2px solid #1C1B3F', borderRadius: 10 }}
            labelFormatter={short}
            formatter={(v: number) => [money ? inr(v) : v, money ? 'Revenue' : 'Count']}
          />
          <Bar dataKey="value" fill={color} stroke="#1C1B3F" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminOverview() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'stats'], queryFn: async () => (await api.get<Stats>('/admin/stats')).data });
  if (error) return <PageError message={errMsg(error, 'Could not load platform stats')} backTo="/admin/users" backLabel="Users" />;
  if (isLoading || !data) return <div className="page"><div className="empty"><span className="spinner" /></div></div>;
  const t = data.totals;

  return (
    <div className="page">
      <PageHead title={<>Platform <span className="mark">overview</span></>} sub="Everything across every workspace. Last 30 days unless noted." />
      <div className="stats">
        <Stat k="MRR" v={inr(t.mrrInr)} s="active Team plans" color="var(--green)" />
        <Stat k="Revenue · 30d" v={inr(t.revenue30dInr)} s={`${inr(t.revenueInr)} all time`} color="var(--accent)" />
        <Stat k="Users" v={t.users} s={`${t.paying} on an active plan`} color="var(--blue)" />
        <Stat k="Organizations" v={t.orgs} s={<Link className="link" to="/admin/orgs">Manage</Link>} color="var(--pink)" />
        <Stat k="Scans" v={t.scans} s="all time" color="var(--orange)" />
        <Stat k="New leads" v={t.leadsNew} s={<Link className="link" to="/admin/leads">Enterprise pipeline</Link>} color="var(--hot)" />
      </div>
      <div className="grid-2">
        <div className="card"><div className="card__title"><h3>Revenue per day</h3></div><MiniBars data={data.series.revenue} color="#6EF0C2" money /></div>
        <div className="card"><div className="card__title"><h3>Scans per day</h3></div><MiniBars data={data.series.scans} color="#8FA8FF" /></div>
        <div className="card"><div className="card__title"><h3>Sign-ups per day</h3></div><MiniBars data={data.series.signups} color="#F7B3D9" /></div>
        <div className="card">
          <div className="card__title"><h3>Active plans (paid + granted)</h3></div>
          {data.planMix.length ? (
            <div className="stack">
              {data.planMix.map((p) => {
                const max = Math.max(...data.planMix.map((x) => x.count));
                return (
                  <div className="meter" key={p.name} style={{ gridTemplateColumns: '110px 1fr 40px' }}>
                    <span>{p.name}</span>
                    <div className="track"><span style={{ width: `${(p.count / max) * 100}%`, background: 'var(--green)' }} /></div>
                    <b>{p.count}</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small">No active plans yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
