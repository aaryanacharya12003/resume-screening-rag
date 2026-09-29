import { ClipboardEvent, FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PublicNav } from '../../components/PublicNav';
import { FullPageSpinner } from '../../components/Guards';
import { useToast } from '../../components/Toast';
import { api, errMsg, Me } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';

const RESEND_SECONDS = 60;

/** After sign-up: enter the 6-digit code emailed to the new account. */
export default function VerifyEmail() {
  const { me, loading, refresh, logout, leaving } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // The sign-up just sent a code, so the first resend is available after the cooldown.
  const [wait, setWait] = useState(RESEND_SECONDS);

  // On arrival, make sure a code is waiting: the server sends one unless it sent one in the last
  // minute (then it answers with how long to wait, which drives the resend countdown).
  const unverified = Boolean(me && !me.user.emailVerified);
  useEffect(() => {
    if (!unverified) return;
    api
      .post('/auth/resend-code')
      .then(() => setWait(RESEND_SECONDS))
      .catch((e) => {
        const secs = Number(errMsg(e).match(/wait (\d+) seconds/)?.[1]);
        setWait(Number.isFinite(secs) ? secs : 0);
      });
  }, [unverified]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  if (loading) return <FullPageSpinner />;
  if (!me) return <Navigate to={leaving ? '/register' : '/login'} replace />;
  const next = params.get('next');
  if (me.user.emailVerified) return <Navigate to={next || homeFor(me.user.role)} replace />;

  const submit = async (e?: FormEvent<HTMLFormElement>, value = code) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(value)) return setErr('Enter the 6-digit code from the email.');
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/verify-email', { code: value });
      const { data } = (await refresh()) as { data: Me | null };
      toast('Email confirmed. Welcome to Resumint!');
      nav(next || homeFor(data?.user.role), { replace: true });
    } catch (e) {
      setErr(errMsg(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr('');
    try {
      const { data } = await api.post<{ emailed?: boolean }>('/auth/resend-code');
      toast(data.emailed === false ? 'Email is not set up on this server; the code was written to the server log.' : `New code sent to ${me.user.email}`);
      setWait(RESEND_SECONDS);
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) void submit(undefined, digits);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (digits.length === 6) {
      e.preventDefault();
      onChange(digits);
    }
  };

  return (
    <>
      <PublicNav />
      <div className="auth">
        <form className="auth__card" onSubmit={submit}>
          <span className="auth__note hand" aria-hidden="true">almost there!</span>
          <h1 className="display h3">Confirm your email</h1>
          <p className="muted">
            We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{me.user.email}</b>. It expires in 10 minutes.
          </p>
          {err && <div className="form-error" role="alert">{err}</div>}
          <label className="field">
            <span>Verification code</span>
            <input
              id="verify-code"
              className="input otp-input"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => onChange(e.target.value)}
              onPaste={onPaste}
              autoFocus
              required
              aria-describedby="verify-help"
            />
          </label>
          <button className="btn btn--accent btn--block" disabled={busy || code.length !== 6}>
            {busy && <span className="spinner" />} Confirm email
          </button>
          <p id="verify-help" className="small muted" style={{ textAlign: 'center' }}>
            Nothing arrived? Check spam, or{' '}
            {wait > 0 ? (
              <span>send a new code in {wait}s</span>
            ) : (
              <button type="button" className="link link--button" onClick={resend}>send a new code</button>
            )}
            .
          </p>
          <p className="small muted" style={{ textAlign: 'center' }}>
            Wrong email?{' '}
            <button type="button" className="link link--button" onClick={() => void logout()}>
              Sign up again
            </button>
          </p>
        </form>
      </div>
    </>
  );
}
