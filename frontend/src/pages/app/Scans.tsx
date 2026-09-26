import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, Scan } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { ScanReport } from '../../components/ScanReport';
import { BoostCard, EditRescoreModal, VersionActions, VersionPanel } from '../../components/Optimizer';
import { ChatPanel } from '../../components/ChatPanel';
import { Empty, PageError, PageHead } from '../../components/Ui';
import { ScanTable, useScans } from './Dashboard';

export function ScansList() {
  const nav = useNavigate();
  const { data: scans = [], isLoading } = useScans();
  return (
    <div className="page">
      <PageHead
        title="My scans"
        sub="Every version you've analyzed."
        actions={<Link className="btn btn--accent" to="/app/scan">New scan →</Link>}
      />
      {isLoading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : scans.length ? (
        <ScanTable scans={scans} onOpen={(id) => nav(`/app/scans/${id}`)} />
      ) : (
        <div className="card"><Empty note="nothing here yet"><Link className="btn btn--sm" to="/app/scan">Scan my resume</Link></Empty></div>
      )}
    </div>
  );
}

export function ScanDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const { data: scan, isLoading, error } = useQuery({
    queryKey: ['scan', id],
    queryFn: async () => (await api.get<Scan>(`/scans/${id}`)).data,
  });

  if (isLoading) return <div className="page"><div className="empty"><span className="spinner" /></div></div>;
  if (error || !scan) return <PageError message={errMsg(error, 'Scan not found')} backTo="/app/scans" backLabel="My scans" />;

  const remove = async () => {
    if (!window.confirm('Delete this scan? This cannot be undone.')) return;
    try {
      await api.delete(`/scans/${scan.id}`);
      await qc.invalidateQueries({ queryKey: ['scans'] });
      toast('Scan deleted');
      nav('/app/scans');
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  const chatEnabled = me!.plan.features.includes('chat');
  const canBoost = me!.plan.features.includes('rewrites') && !scan.locked;
  const isVersion = Boolean(scan.result.optimized || scan.result.editedFrom);
  // Editing needs the stored text (scans made before text was saved don't have it) and Pro.
  const canEdit = Boolean(scan.result.resumeText) && me!.plan.features.includes('fullReport') && !scan.locked;
  const toBoost = () => document.getElementById('boost')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="page">
      <PageHead
        title={scan.result.targetRole || 'Resume report'}
        sub={`${scan.fileName} · ${fmtDate(scan.createdAt)}`}
        actions={
          <>
            {scan.score < 90 && (
              <button className="btn btn--accent btn--sm" onClick={toBoost}>Boost to 90+</button>
            )}
            <Link className="btn btn--light btn--sm" to={`/app/compare?a=${scan.id}`}>Compare</Link>
            <button className="btn btn--danger btn--sm" onClick={remove}>Delete</button>
          </>
        }
      />
      {isVersion ? (
        <VersionPanel key={scan.id} scan={scan} />
      ) : (
        canEdit && <VersionActions scan={scan} onEdit={() => setEditing(true)} />
      )}
      <ScanReport scan={scan} />
      <div id="boost"><BoostCard key={scan.id} scan={scan} canUse={canBoost} /></div>
      <div className="card">
        <div className="card__title">
          <h3>Ask the AI recruiter</h3>
          {scan.result.ragReady === false && <span className="chip chip--o">Search index unavailable for this scan</span>}
        </div>
        <ChatPanel sessionId={scan.sessionId} enabled={chatEnabled} />
      </div>
      {editing && <EditRescoreModal scan={scan} onClose={() => setEditing(false)} />}
    </div>
  );
}
