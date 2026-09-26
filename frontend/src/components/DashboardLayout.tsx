import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../lib/auth';

type Item = [to: string, label: string, end?: boolean];

const personal: Item[] = [
  ['/app', 'Dashboard', true],
  ['/app/scan', 'New scan'],
  ['/app/scans', 'My scans'],
  ['/app/compare', 'Compare versions'],
  ['/app/billing', 'Plan & billing'],
];
const org: Item[] = [
  ['/org', 'Overview', true],
  ['/org/jobs', 'Jobs & screening'],
  ['/org/team', 'Team & seats'],
  ['/org/billing', 'Team billing'],
];
const admin: Item[] = [
  ['/admin', 'Overview', true],
  ['/admin/users', 'Users'],
  ['/admin/orgs', 'Organizations'],
  ['/admin/plans', 'Plans & pricing'],
  ['/admin/payments', 'Payments'],
  ['/admin/leads', 'Enterprise leads'],
  ['/admin/audit', 'Audit log'],
];

function Group({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="side__group">
      <span className="side__label">{label}</span>
      {items.map(([to, text, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
          {text}
        </NavLink>
      ))}
    </div>
  );
}

export function DashboardLayout() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  if (!me) return null;
  const role = me.user.role;
  const initials = me.user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`shell${open ? ' open' : ''}`}>
      <aside className="side" aria-label="Dashboard">
        <Logo to="/" />
        {role === 'SUPER_ADMIN' && <Group label="Super admin" items={admin} />}
        {role === 'ORG_ADMIN' && <Group label={me.org?.name ?? 'Organization'} items={org} />}
        <Group label={role === 'USER' ? 'Workspace' : 'My resumes'} items={personal} />

        <div className="side__plan">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{me.plan.name}</b>
            {me.plan.source === 'org' && <span className="chip chip--g">via {me.org?.name}</span>}
          </div>
          {me.plan.code === 'free' ? (
            <>
              <span style={{ opacity: 0.8 }}>{Math.max(0, (me.plan.limits.scansTotal ?? 1) - me.usage.scansTotal)} free scan left</span>
              <Link className="btn btn--accent btn--sm" to="/app/billing">Upgrade — ₹99</Link>
            </>
          ) : (
            <span style={{ opacity: 0.8 }}>{me.usage.scansThisMonth} scans this month</span>
          )}
        </div>
        <div className="side__user">
          <span className="av" style={{ background: 'var(--accent)' }}>{initials}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>{me.user.name}</b>
            <small>{me.user.email}</small>
          </div>
          <button
            className="btn btn--sm btn--light"
            style={{ padding: '6px 10px' }}
            onClick={async () => {
              await logout();
              nav('/');
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <Logo to="/" />
          <button className="btn btn--sm btn--light" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
        </div>
        {/* Keeps the sidebar on screen while a lazily loaded page arrives. */}
        <Suspense fallback={<div className="page-loading"><span className="spinner" /></div>}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
