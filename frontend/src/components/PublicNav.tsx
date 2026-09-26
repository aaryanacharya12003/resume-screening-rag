import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { homeFor, useAuth } from '../lib/auth';

export function PublicNav() {
  const { me } = useAuth();
  return (
    <nav className="nav" aria-label="Main">
      <div className="wrap">
        <Logo />
        <ul>
          <li><a href="/#how">How it works</a></li>
          <li><a href="/#checks">Checks</a></li>
          <li><Link to="/pricing">Pricing</Link></li>
          <li><Link to="/pricing#enterprise">For teams</Link></li>
          <li><a href="/#faq">FAQ</a></li>
        </ul>
        <div className="row" style={{ gap: 8 }}>
          {me ? (
            <Link className="btn btn--sm" to={homeFor(me.user.role)}>Dashboard →</Link>
          ) : (
            <>
              <Link className="btn btn--sm btn--ghost" to="/login">Log in</Link>
              <Link className="btn btn--sm" to="/register">Try it free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
