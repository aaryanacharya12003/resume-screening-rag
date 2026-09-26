import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api, fmtDate, Scan } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Empty, PageHead, ScoreBadge, Stat } from '../../components/Ui';

export const useScans = () =>
  useQuery({ queryKey: ['scans'], queryFn: async () => (await api.get<Scan[]>('/scans')).data });

export default function Dashboard() {
  const { me } = useAuth();
  const nav = useNavigate();
  const { data: scans = [], isLoading } = useScans();
  const first = me!.user.name.split(' ')[0];
  const latest = scans[0];
  const best = scans.reduce((m, s) => Math.max(m, s.score), 0);
  const trend = [...scans].reverse().map((s, i) => ({ n: `#${i + 1}`, score: s.score, date: fmtDate(s.createdAt) }));
  const delta = scans.length > 1 ? scans[0].score - scans[scans.length - 1].score : 0;

  return (
    <div className="page">
      <PageHead
        title={<>Hey {first}, <span className="mark">let's sharpen it.</span></>}
        sub="Every scan is saved, so you can track how each version of your resume improves."
        actions={<Link className="btn btn--accent" to="/app/scan">New scan <span className="arrow">→</span></Link>}
      />

      <div className="stats">
        <Stat k="Latest score" v={latest ? latest.score : '–'} s={latest ? fmtDate(latest.createdAt) : 'No scans yet'} color="var(--accent)" />
        <Stat k="Best score" v={best || '–'} s="across all versions" color="var(--green)" />
        <Stat k="Improvement" v={scans.length > 1 ? `${delta >= 0 ? '+' : ''}${delta}` : '–'} s="first → latest" color="var(--pink)" />
        <Stat k="Plan" v={<span style={{ fontSize: 28 }}>{me!.plan.name}</span>} s={me!.plan.code === 'free' ? `${Math.max(0, 1 - me!.usage.scansTotal)} free scan left` : 'Unlimited scans'} color="var(--blue)" />
      </div>

      <div className="grid-3">
        <div className="card">
          <div className="card__title"><h3>Score over time</h3></div>
          {trend.length > 1 ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#DFE3F1" vertical={false} />
                  <XAxis dataKey="n" tick={{ fontSize: 12 }} stroke="#A2A6C4" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#A2A6C4" />
                  <Tooltip contentStyle={{ border: '2px solid #1C1B3F', borderRadius: 10 }} labelFormatter={(_, p) => p?.[0]?.payload?.date} />
                  <Line type="monotone" dataKey="score" stroke="#FF4F8B" strokeWidth={3} dot={{ r: 5, stroke: '#1C1B3F', strokeWidth: 2, fill: '#6EF0C2' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty note="scan twice to see a trend ↗">
              <span>Re-scan after you fix issues to watch your score climb.</span>
            </Empty>
          )}
        </div>
        <div className="card card--panel stack">
          <p className="eyebrow" style={{ color: 'rgba(245,246,252,.65)' }}>Next best fix</p>
          {latest?.result.issues?.[0] ? (
            <>
              <b style={{ fontSize: 18 }}>{latest.result.issues[0].title}</b>
              <p style={{ opacity: 0.85, fontSize: 14 }}>{latest.result.issues[0].detail}</p>
              <Link className="btn btn--accent btn--sm" to={`/app/scans/${latest.id}`} style={{ alignSelf: 'flex-start' }}>Open report →</Link>
            </>
          ) : (
            <>
              <b style={{ fontSize: 18 }}>Run your first scan</b>
              <p style={{ opacity: 0.85, fontSize: 14 }}>Upload a PDF resume and optionally a job description. Results in about 20 seconds.</p>
              <Link className="btn btn--accent btn--sm" to="/app/scan" style={{ alignSelf: 'flex-start' }}>Start →</Link>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="card__title"><h3>Recent scans</h3><Link className="link small" to="/app/scans">View all</Link></div>
        {isLoading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : scans.length === 0 ? (
          <div className="card"><Empty note="nothing here yet"><Link className="btn btn--sm" to="/app/scan">Scan my resume</Link></Empty></div>
        ) : (
          <ScanTable scans={scans.slice(0, 5)} onOpen={(id) => nav(`/app/scans/${id}`)} />
        )}
      </div>
    </div>
  );
}

export function ScanTable({ scans, onOpen }: { scans: Scan[]; onOpen: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>File</th><th>Target role</th><th>Type</th><th>Date</th><th className="num">Score</th></tr>
        </thead>
        <tbody>
          {scans.map((s) => (
            <tr key={s.id} className="clickable" onClick={() => onOpen(s.id)}>
              <td><b>{s.fileName}</b></td>
              <td className="muted">{s.result.targetRole || '–'}</td>
              <td>{s.result.hasJobDescription ? <span className="chip chip--b">JD match</span> : <span className="chip chip--plain">General</span>}</td>
              <td className="muted">{fmtDate(s.createdAt)}</td>
              <td className="num"><ScoreBadge n={s.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
