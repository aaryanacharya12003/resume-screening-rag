import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PublicNav } from '../../components/PublicNav';
import { api, errMsg, Me } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';

/** Sign-up for individuals and teams; also handles /invite/:token links. */
export default function Register() {
  const [params] = useSearchParams();
  const { token } = useParams();
  const nav = useNavigate();
  const { me, refresh } = useAuth();
  const [type, setType] = useState<'individual' | 'team'>(params.get('type') === 'team' ? 'team' : 'individual');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const invite = useQuery({
    queryKey: ['invite', token],
    enabled: !!token,
    queryFn: async () => (await api.get<{ email: string; orgName: string; role: string }>(`/auth/invite/${token}`)).data,
  });

  const goHome = async () => {
    const { data } = (await refresh()) as { data: Me | null };
    nav(params.get('next') || homeFor(data?.user.role), { replace: true });
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/register', { ...f, accountType: token ? 'individual' : type, inviteToken: token });
      await goHome();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const acceptAsExisting = async () => {
    setBusy(true);
    try {
      await api.post(`/auth/invite/${token}/accept`);
      await goHome();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (token && invite.isError) {
    return (
      <>
        <PublicNav />
        <div className="auth">
          <div className="auth__card">
            <h1 className="display h3">Invite expired</h1>
            <p className="muted">Ask your team admin to send a new invite.</p>
            <Link className="btn" to="/">Go home</Link>
          </div>
        </div>
      </>
    );
  }

  const note = token ? 'join the team!' : "let's go!";

  return (
    <>
      <PublicNav />
      <div className="auth">
        <form className="auth__card" onSubmit={submit}>
          <span className="auth__note hand" aria-hidden="true">{note}</span>
          <h1 className="display h3">
            {token ? <>Join <span className="mark">{invite.data?.orgName ?? '…'}</span></> : 'Create your account'}
          </h1>
          {!token && (
            <div className="seg" role="group" aria-label="Account type">
              <button type="button" aria-pressed={type === 'individual'} onClick={() => setType('individual')}>Job seeker</button>
              <button type="button" aria-pressed={type === 'team'} onClick={() => setType('team')}>Hiring team</button>
            </div>
          )}
          {err && <div className="form-error">{err}</div>}
          {token && me ? (
            <>
              <p className="muted">You're signed in as <b>{me.user.email}</b>.</p>
              <button type="button" className="btn btn--accent btn--block" disabled={busy} onClick={acceptAsExisting}>Accept invite</button>
            </>
          ) : (
            <>
              <label className="field"><span>Full name</span><input className="input" name="name" autoComplete="name" required minLength={2} /></label>
              <label className="field">
                <span>{type === 'team' ? 'Work email' : 'Email'}</span>
                <input className="input" name="email" type="email" autoComplete="email" required defaultValue={invite.data?.email} key={invite.data?.email} readOnly={!!token} />
              </label>
              {type === 'team' && !token && (
                <label className="field"><span>Company name</span><input className="input" name="companyName" required /></label>
              )}
              <label className="field">
                <span>Password</span>
                <input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="8+ characters" />
              </label>
              <button className="btn btn--accent btn--block" disabled={busy}>
                {busy && <span className="spinner" />}
                {token ? 'Join team' : type === 'team' ? 'Create team workspace' : 'Get my free scan'}
              </button>
            </>
          )}
          <p className="small muted" style={{ textAlign: 'center' }}>
            Already have an account? <Link className="link" to={`/login${token ? `?next=/invite/${token}` : ''}`}>Log in</Link>
          </p>
        </form>
      </div>
    </>
  );
}
