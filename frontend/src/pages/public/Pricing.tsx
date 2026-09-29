import { PublicNav } from '../../components/PublicNav';
import { Footer } from '../../components/Footer';
import { CompareTable, ContactSales, PricingPlans } from '../../components/Pricing';

export default function PricingPage() {
  return (
    <>
      <PublicNav />
      <main>
        <section className="section" id="plans">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">Pricing</p>
              <h1 className="display h1" style={{ fontSize: 'clamp(38px,5.4vw,62px)' }}>
                One price for you. <span className="mark">Real plans for teams.</span>
              </h1>
              <p className="lede">Start free. Pay ₹99 once for unlimited personal scans, or give your whole hiring team AI screening.</p>
            </div>
            <PricingPlans />
          </div>
        </section>
        <section className="section">
          <div className="wrap">
            <div className="head head--center"><p className="eyebrow">Compare</p><h2 className="display h2">Every feature, <em>side by side.</em></h2></div>
            <CompareTable />
          </div>
        </section>
        <section className="section" id="enterprise">
          <div className="wrap split">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p className="eyebrow">Enterprise</p>
              <h2 className="display h2">Hiring at scale? <em>Let's talk.</em></h2>
              <p className="lede">Unlimited seats and screening, SSO / SAML, REST API, white-label reports, custom data retention, a security review pack and a 99.9% uptime SLA with a dedicated success manager.</p>
            </div>
            <ContactSales />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
