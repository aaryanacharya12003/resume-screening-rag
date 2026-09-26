import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PublicNav } from '../../components/PublicNav';
import { api, errMsg, Me } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';

export default function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/login', f);
      const { data } = (await refresh()) as { data: Me | null };
      nav(next || homeFor(data?.user.role), { replace: true });
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
        <form className="auth__card" onSubmit={submit}>
          <span className="auth__note hand" aria-hidden="true">welcome back!</span>
          <h1 className="display h3">Log in to Resumint</h1>
          {err && <div className="form-error">{err}</div>}
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
          <label className="field">
            <span className="row" style={{ justifyContent: 'space-between' }}>
              Password
              <Link className="link" to="/forgot-password" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Forgot password?</Link>
            </span>
            <input className="input" name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn--accent btn--block" disabled={busy}>{busy && <span className="spinner" />} Log in</button>
          <p className="small muted" style={{ textAlign: 'center' }}>
            New here? <Link className="link" to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create a free account</Link>
          </p>
        </form>
      </div>
    </>
  );
}
