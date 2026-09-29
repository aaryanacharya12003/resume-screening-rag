import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { GuestOnly, RequireAuth } from './components/Guards';
import { PublicNav } from './components/PublicNav';
import Landing from './pages/public/Landing';
import PricingPage from './pages/public/Pricing';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import { ForgotPassword, ResetPassword } from './pages/public/PasswordReset';
import VerifyEmail from './pages/public/VerifyEmail';

const InfoPages = () => import('./pages/public/InfoPages');
const AboutPage = lazy(() => InfoPages().then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => InfoPages().then((m) => ({ default: m.ContactPage })));
const PrivacyPage = lazy(() => InfoPages().then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => InfoPages().then((m) => ({ default: m.TermsPage })));
const RefundPage = lazy(() => InfoPages().then((m) => ({ default: m.RefundPage })));
const DeliveryPage = lazy(() => InfoPages().then((m) => ({ default: m.DeliveryPage })));
// Signed-in areas load on demand so visitors to the public pages don't download the app,
// org and admin screens (and their chart libraries).
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const NewScan = lazy(() => import('./pages/app/NewScan'));
const ScansList = lazy(() => import('./pages/app/Scans').then((m) => ({ default: m.ScansList })));
const ScanDetail = lazy(() => import('./pages/app/Scans').then((m) => ({ default: m.ScanDetail })));
const Compare = lazy(() => import('./pages/app/Compare'));
const Billing = lazy(() => import('./pages/app/Billing'));
const OrgOverviewPage = lazy(() => import('./pages/org/OrgOverview'));
const Team = lazy(() => import('./pages/org/Team'));
const Jobs = lazy(() => import('./pages/org/Jobs'));
const JobDetail = lazy(() => import('./pages/org/JobDetail'));
const OrgBilling = lazy(() => import('./pages/org/OrgBilling'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminOrgs = lazy(() => import('./pages/admin/AdminOrgs'));
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans'));
const AdminAudit = lazy(() => import('./pages/admin/AdminMisc').then((m) => ({ default: m.AdminAudit })));
const AdminLeads = lazy(() => import('./pages/admin/AdminMisc').then((m) => ({ default: m.AdminLeads })));
const AdminPayments = lazy(() => import('./pages/admin/AdminMisc').then((m) => ({ default: m.AdminPayments })));

/** Top of the page on navigation; for links with a #section, scroll to it once it has rendered. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 40) {
        window.clearInterval(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 75);
    return () => window.clearInterval(id);
  }, [pathname, hash]);
  return null;
}

function NotFound() {
  return (
    <>
      <PublicNav />
      <div className="auth">
        <div className="auth__card" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="hand" style={{ fontSize: 30, color: 'var(--hot)' }}>page not found</span>
          <h1 className="display h3">This page went missing.</h1>
          <Link className="btn btn--accent" to="/">Go home</Link>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="page-loading"><span className="spinner" /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/invite/:token" element={<Register />} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPage />} />
        <Route path="/delivery-policy" element={<DeliveryPage />} />

        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/scan" element={<NewScan />} />
          <Route path="/app/scans" element={<ScansList />} />
          <Route path="/app/scans/:id" element={<ScanDetail />} />
          <Route path="/app/compare" element={<Compare />} />
          <Route path="/app/billing" element={<Billing />} />
        </Route>

        <Route element={<RequireAuth roles={['ORG_ADMIN']}><DashboardLayout /></RequireAuth>}>
          <Route path="/org" element={<OrgOverviewPage />} />
          <Route path="/org/team" element={<Team />} />
          <Route path="/org/jobs" element={<Jobs />} />
          <Route path="/org/jobs/:id" element={<JobDetail />} />
          <Route path="/org/billing" element={<OrgBilling />} />
        </Route>

        <Route element={<RequireAuth roles={['SUPER_ADMIN']}><DashboardLayout /></RequireAuth>}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/orgs" element={<AdminOrgs />} />
          <Route path="/admin/plans" element={<AdminPlans />} />
          <Route path="/admin/payments" element={<AdminPayments />} />
          <Route path="/admin/leads" element={<AdminLeads />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
        </Route>

        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
}
