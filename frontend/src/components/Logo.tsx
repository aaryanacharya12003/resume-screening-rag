import { Link } from 'react-router-dom';

/** Resumint mark: a mint tile with a check, drawn in currentColor so it adapts to light/dark backgrounds. */
export function LogoMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1.5" y="1.5" width="17" height="17" rx="5.5" fill="var(--accent)" stroke="currentColor" strokeWidth="2" />
      <path d="M6 10.4l2.7 2.7L14.2 7.4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link className="logo" to={to}>
      <LogoMark />
      Resumint
    </Link>
  );
}
