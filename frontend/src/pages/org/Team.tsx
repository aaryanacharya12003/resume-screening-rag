import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg, fmtDate, isUpgradeError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { PageHead } from '../../components/Ui';

interface Member { id: string; name: string; email: string; role: 'USER' | 'ORG_ADMIN'; createdAt: string; lastLoginAt: string | null; scansThisMonth: number }
interface Invite { id: string; email: string; role: string; token: string; expiresAt: string; lastSentAt: string | null }
interface TeamData { members: Member[]; invites: Invite[]; seats: { total: number | null; used: number; pending: number } }

const linkFor = (token: string) => `${window.location.origin}/invite/${token}`;

export default function Team() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [err, setErr] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [sent, setSent] = useState<{ link: string; email: string; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ['team'], queryFn: async () => (await api.get<TeamData>('/org/members')).data });

  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ['team'] }), qc.invalidateQueries({ queryKey: ['org'] })]);

  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.post('/org/invites', f);
      setSent({ link: linkFor(data.token), email: data.email, emailed: data.emailed });
      await reload();
    } catch (e) {
      setErr({ text: errMsg(e), upgrade: isUpgradeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await reload();
      toast(ok);
    } catch (e) {
      toast(errMsg(e), true);
    }
  };

  const resend = (i: Invite) =>
    act(async () => {
      const { data } = await api.post(`/org/invites/${i.id}/resend`);
      if (!data.emailed) throw new Error('Email is not set up on the server yet. Copy the link instead.');
    }, `Invite re-sent to ${i.email}`);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Invite link copied');
    } catch {
      toast('Copy failed. Select the link and copy it manually.', true);
    }
  };

  const seats = data?.seats;

  return (
    <div className="page">
      <PageHead
        title="Team & seats"
        sub={seats ? `${seats.used} of ${seats.total ?? '∞'} seats used${seats.pending ? ` · ${seats.pending} pending` : ''}` : ' '}
        actions={
          <>
            <Link className="btn btn--light btn--sm" to="/org/billing">Buy seats</Link>
            <button className="btn btn--accent" onClick={() => { setInviting(true); setSent(null); setErr(null); }}>Invite recruiter</button>
          </>
        }
      />

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Last active</th><th className="num">Scans (month)</th><th></th></tr></thead>
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b><div className="small muted">{m.email}</div></td>
                <td>
                  {m.id === me!.user.id ? (
                    <span className="chip chip--y">Admin (you)</span>
                  ) : (
                    <select
                      className="select input--sm"
                      style={{ width: 'auto' }}
                      value={m.role}
                      onChange={(e) => act(() => api.patch(`/org/members/${m.id}`, { role: e.target.value }), 'Role updated')}
                    >
                      <option value="USER">Recruiter</option>
                      <option value="ORG_ADMIN">Admin</option>
                    </select>
                  )}
                </td>
                <td className="muted">{fmtDate(m.createdAt)}</td>
                <td className="muted">{m.lastLoginAt ? fmtDate(m.lastLoginAt) : '–'}</td>
                <td className="num">{m.scansThisMonth}</td>
                <td className="num">
                  {m.id !== me!.user.id && (
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => window.confirm(`Remove ${m.name} from the team? They keep their account but lose team access.`) && act(() => api.delete(`/org/members/${m.id}`), 'Member removed')}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.invites.length > 0 && (
        <div>
          <div className="card__title"><h3>Pending invites</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Delivery</th><th></th></tr></thead>
              <tbody>
                {data.invites.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.email}</b></td>
                    <td>{i.role === 'ORG_ADMIN' ? 'Admin' : 'Recruiter'}</td>
                    <td className="muted">{fmtDate(i.expiresAt)}</td>
                    <td className="muted small">{i.lastSentAt ? `Emailed ${fmtDate(i.lastSentAt)}` : 'Link only'}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn btn--light btn--sm" onClick={() => resend(i)}>Resend</button>
                        <button className="btn btn--light btn--sm" onClick={() => copy(linkFor(i.token))}>Copy link</button>
                        <button className="btn btn--danger btn--sm" onClick={() => act(() => api.delete(`/org/invites/${i.id}`), 'Invite revoked')}>Revoke</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inviting && (
        <Modal title="Invite a recruiter" onClose={() => setInviting(false)}>
          {sent ? (
            <div className="stack">
              {sent.emailed ? (
                <p>We emailed an invite to <b>{sent.email}</b>. You can also share the link below directly. It works for 7 days.</p>
              ) : (
                <p className="form-error" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                  Email isn't set up on the server yet, so share this link with {sent.email} yourself. It works for 7 days.
                </p>
              )}
              <input className="input" readOnly value={sent.link} onFocus={(e) => e.target.select()} />
              <div className="row">
                <button className="btn btn--accent" onClick={() => copy(sent.link)}>Copy link</button>
                <button className="btn btn--light" onClick={() => setSent(null)}>Invite another</button>
              </div>
            </div>
          ) : (
            <form className="stack" onSubmit={invite}>
              {err && (
                <div className="form-error row" style={{ justifyContent: 'space-between' }}>
                  <span>{err.text}</span>
                  {err.upgrade && <Link className="btn btn--sm btn--accent" to="/org/billing">Buy seats</Link>}
                </div>
              )}
              <label className="field"><span>Email</span><input className="input" name="email" type="email" required autoFocus /></label>
              <label className="field">
                <span>Role</span>
                <select className="select" name="role" defaultValue="USER">
                  <option value="USER">Recruiter: screens candidates</option>
                  <option value="ORG_ADMIN">Admin: also manages team, jobs and billing</option>
                </select>
              </label>
              <button className="btn btn--accent" disabled={busy}>{busy && <span className="spinner" />} Send invite</button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
