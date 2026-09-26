import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PublicNav } from '../../components/PublicNav';
import { useToast } from '../../components/Toast';
import { api, errMsg, Me } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';

export function ForgotPassword() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PublicNav />
      <div className="auth">
        {sentTo ? (
          <div className="auth__card">
            <span className="auth__note hand" aria-hidden="true">check your inbox!</span>
            <h1 className="display h3">Check your email</h1>
            <p className="muted">
              If an account exists for <b style={{ color: 'var(--ink)' }}>{sentTo}</b>, we've sent a link to reset your password. It expires in 1 hour.
            </p>
            <p className="small muted">Nothing arrived? Check spam, or wait a minute and try again.</p>
            <div className="row">
              <button className="btn btn--light btn--sm" onClick={() => setSentTo(null)}>Try another email</button>
              <Link className="btn btn--sm" to="/login">Back to log in</Link>
            </div>
          </div>
        ) : (
          <form className="auth__card" onSubmit={submit}>
            <span className="auth__note hand" aria-hidden="true">it happens!</span>
            <h1 className="display h3">Forgot your password?</h1>
            <p className="muted">Enter your account email and we'll send you a reset link.</p>
            {err && <div className="form-error">{err}</div>}
            <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required autoFocus /></label>
            <button className="btn btn--accent btn--block" disabled={busy}>{busy && <span className="spinner" />} Send reset link</button>
            <p className="small muted" style={{ textAlign: 'center' }}>Remembered it? <Link className="link" to="/login">Log in</Link></p>
          </form>
        )}
      </div>
    </>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useQuery({
    queryKey: ['reset', token],
    queryFn: async () => (await api.get<{ email: string }>(`/auth/reset-password/${token}`)).data,
  });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password'));
    if (password !== String(f.get('confirm'))) return setErr("Passwords don't match");
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/reset-password', { token, password });
      const { data } = (await refresh()) as { data: Me | null };
      toast('Password updated. You are signed in.');
      nav(homeFor(data?.user.role), { replace: true });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PublicNav />
      <div className="auth">
        {check.isLoading ? (
          <span className="spinner" aria-label="Loading" />
        ) : check.isError ? (
          <div className="auth__card">
            <h1 className="display h3">Link expired</h1>
            <p className="muted">{errMsg(check.error)}</p>
            <Link className="btn btn--accent" to="/forgot-password">Send a new link</Link>
          </div>
        ) : (
          <form className="auth__card" onSubmit={submit}>
            <span className="auth__note hand" aria-hidden="true">fresh start!</span>
            <h1 className="display h3">Choose a new password</h1>
            <p className="muted small">For <b style={{ color: 'var(--ink)' }}>{check.data?.email}</b>. This signs you out everywhere else.</p>
            {err && <div className="form-error">{err}</div>}
            <label className="field"><span>New password</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus placeholder="8+ characters" /></label>
            <label className="field"><span>Confirm password</span><input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
            <button className="btn btn--accent btn--block" disabled={busy}>{busy && <span className="spinner" />} Update password</button>
          </form>
        )}
      </div>
    </>
  );
}
