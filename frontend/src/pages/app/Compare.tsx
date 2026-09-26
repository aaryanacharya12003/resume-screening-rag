import { Link, useSearchParams } from 'react-router-dom';
import { Scan } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Empty, PageHead, ScoreBadge } from '../../components/Ui';
import { useScans } from './Dashboard';

const CATS: Array<[keyof Scan['result']['categories'], string]> = [
  ['ats', 'ATS'],
  ['readability', 'Readability'],
  ['keywords', 'Keywords'],
  ['impact', 'Impact'],
];

/** "Boosted · 26 Sep, 1:14 pm · 92" — versions of one resume share a file name, so type and time tell them apart. */
function versionLabel(s: Scan) {
  const kind = s.result.optimized ? 'Boosted' : s.result.editedFrom ? 'Edited' : 'Original';
  const when = new Date(s.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return `${s.fileName} · ${kind} · ${when} · ${s.score}`;
}

function Delta({ a, b }: { a: number; b: number }) {
  const d = b - a;
  const color = d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)';
  return <b style={{ color, fontVariantNumeric: 'tabular-nums' }}>{d > 0 ? '+' : ''}{d}</b>;
}

export default function Compare() {
  const { me } = useAuth();
  const { data: scans = [] } = useScans();
  const [params, setParams] = useSearchParams();

  if (!me!.plan.features.includes('history')) {
    return (
      <div className="page">
        <PageHead title="Compare versions" />
        <div className="locked">
          <b style={{ fontSize: 18 }}>Track how every version improves</b>
          <span className="muted">Version comparison is part of Pro.</span>
          <Link className="btn btn--accent" to="/app/billing">Upgrade to Pro →</Link>
        </div>
      </div>
    );
  }
  if (scans.length < 2) {
    return (
      <div className="page">
        <PageHead title="Compare versions" />
        <div className="card"><Empty note="need two scans">Scan an updated version of your resume, then compare them here.<Link className="btn btn--sm" to="/app/scan">New scan</Link></Empty></div>
      </div>
    );
  }

  // Default: oldest vs newest.
  const aId = params.get('a') || scans[scans.length - 1].id;
  const bId = params.get('b') || (scans[0].id === aId ? scans[1].id : scans[0].id);
  const a = scans.find((s) => s.id === aId) ?? scans[scans.length - 1];
  const b = scans.find((s) => s.id === bId) ?? scans[0];
  const set = (k: 'a' | 'b', v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const fixed = (a.result.issues ?? []).filter((i) => !(b.result.issues ?? []).some((j) => j.check === i.check && j.check));
  const newKw = (b.result.keywords?.have ?? []).filter((k) => !(a.result.keywords?.have ?? []).includes(k));

  return (
    <div className="page">
      <PageHead title="Compare versions" sub="See what changed between two scans." />
      <div className="grid-2">
        {(['a', 'b'] as const).map((k) => {
          const s = k === 'a' ? a : b;
          return (
            <div key={k} className={`card ${k === 'b' ? 'card--ink' : ''} stack`}>
              <label className="field">
                <span>{k === 'a' ? 'Before' : 'After'}</span>
                <select className="select" value={s.id} onChange={(e) => set(k, e.target.value)}>
                  {scans.map((x) => <option key={x.id} value={x.id}>{versionLabel(x)}</option>)}
                </select>
              </label>
              <div className="row" style={{ alignItems: 'baseline' }}><span className="big-score" style={{ fontSize: 64 }}>{s.score}</span><span className="muted">/ 100</span></div>
            </div>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Category</th><th className="num">Before</th><th className="num">After</th><th className="num">Change</th></tr></thead>
          <tbody>
            <tr><td><b>Overall</b></td><td className="num"><ScoreBadge n={a.score} /></td><td className="num"><ScoreBadge n={b.score} /></td><td className="num"><Delta a={a.score} b={b.score} /></td></tr>
            {CATS.map(([k, label]) => (
              <tr key={k}>
                <td>{label}</td>
                <td className="num">{a.result.categories[k]}</td>
                <td className="num">{b.result.categories[k]}</td>
                <td className="num"><Delta a={a.result.categories[k]} b={b.result.categories[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card__title"><h3>Issues resolved</h3><span className="chip chip--g">{fixed.length}</span></div>
          {fixed.length ? <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">{fixed.map((i) => <li key={i.title}>{i.title}</li>)}</ul> : <p className="muted small">No issue categories fully resolved yet.</p>}
        </div>
        <div className="card">
          <div className="card__title"><h3>Newly proven keywords</h3><span className="chip chip--b">{newKw.length}</span></div>
          <div className="row">{newKw.length ? newKw.map((k) => <span key={k} className="chip chip--g">✓ {k}</span>) : <p className="muted small">No new keywords.</p>}</div>
        </div>
      </div>
    </div>
  );
}
