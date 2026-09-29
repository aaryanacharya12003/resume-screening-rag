import { FormEvent, ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicNav } from '../../components/PublicNav';
import { Footer } from '../../components/Footer';
import { api, errMsg } from '../../lib/api';
import { COMPANY } from '../../lib/company';

/** Shared layout for the About, Contact and legal pages. */
function InfoPage({ eyebrow, title, lede, updated, children }: { eyebrow: string; title: ReactNode; lede?: string; updated?: boolean; children: ReactNode }) {
  return (
    <>
      <PublicNav />
      <main>
        <section className="section">
          <div className="wrap prose-wrap">
            <div className="head">
              <p className="eyebrow">{eyebrow}</p>
              <h1 className="display h2">{title}</h1>
              {lede && <p className="lede">{lede}</p>}
              {updated && <p className="small muted">Last updated {COMPANY.legalUpdated}</p>}
            </div>
            <article className="prose">{children}</article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

const ContactLine = () => (
  <>
    through our <Link to="/contact">Contact page</Link>
    {COMPANY.supportEmail && (
      <>
        {' '}or at <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
      </>
    )}
  </>
);

/* ---------------- About ---------------- */

export function AboutPage() {
  return (
    <InfoPage eyebrow="About" title={<>Honest help for <em>better resumes.</em></>} lede="Resumint reads a resume the way a recruiter and an applicant tracking system do, then shows exactly what to fix.">
      <h2>What we do</h2>
      <p>
        Upload a resume and get a scored report in under a minute: ATS parsing, impact, keywords and readability, with the specific
        issues holding it back and stronger versions of weak bullets. Add a job description and the report measures fit for that role.
      </p>
      <p>
        When you want more, Boost edits the resume area by area and keeps a new version only if no score goes down, and the resume
        assistant adds details you give it in a chat. Both fact-check every change against your real experience: they never add
        skills, numbers or roles you haven't told us about.
      </p>
      <h2>For hiring teams</h2>
      <p>
        Teams post a job, drop in hundreds of resumes and get a ranked shortlist with the reasons behind each score, shared across
        recruiter seats. See <Link to="/pricing">plans and pricing</Link>.
      </p>
      <h2>What we believe</h2>
      <ul>
        <li>A resume should be true. We help you say it better, not say more than you did.</li>
        <li>Scores should explain themselves. Every number comes with the checks behind it.</li>
        <li>Your resume is yours. Delete a scan and its text and search index go with it.</li>
      </ul>
      <p>
        Questions or ideas? Reach us <ContactLine />.
      </p>
    </InfoPage>
  );
}

/* ---------------- Contact ---------------- */

const TOPICS = ['Support', 'Billing and refunds', 'Sales and teams', 'Privacy and data', 'Something else'];

export function ContactPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setErr('');
    try {
      await api.post('/billing/contact', f);
      setSent(true);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InfoPage eyebrow="Contact" title={<>Talk to <em>a person.</em></>} lede="Questions about your account, a payment, your data or a team plan. We reply within one business day.">
      <div className="split contact-split">
        <div className="stack">
          <h2>Other ways to reach us</h2>
          {COMPANY.supportEmail && (
            <p>
              Email: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            </p>
          )}
          {COMPANY.address && <p>Address: {COMPANY.address}</p>}
          <p>
            Hiring for a team of 20 or more? The <Link to="/pricing#enterprise">Enterprise form</Link> gets you a tailored quote.
          </p>
          <p>
            Forgot your password? <Link to="/forgot-password">Reset it here</Link>; you don't need to contact us.
          </p>
        </div>
        {sent ? (
          <div className="card card--panel" style={{ textAlign: 'center', padding: 36 }}>
            <span className="hand" style={{ fontSize: 30, color: 'var(--accent)' }}>message sent!</span>
            <p style={{ marginTop: 8 }}>Thanks. We'll reply to your email within one business day.</p>
          </div>
        ) : (
          <form className="card stack" onSubmit={submit}>
            {err && <div className="form-error" role="alert">{err}</div>}
            {/* Honeypot for bots: hidden from people and screen readers. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label className="field">
              <span>Your name</span>
              <input id="contact-name" className="input" name="name" required minLength={2} maxLength={100} autoComplete="name" />
            </label>
            <label className="field">
              <span>Email</span>
              <input id="contact-email" className="input" name="email" type="email" required autoComplete="email" />
            </label>
            <label className="field">
              <span>Topic</span>
              <select id="contact-topic" className="select" name="topic" defaultValue={TOPICS[0]}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Message</span>
              <textarea id="contact-message" className="textarea" name="message" required minLength={10} maxLength={2000} rows={5} placeholder="How can we help?" />
            </label>
            <button className="btn btn--accent" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              {busy && <span className="spinner" />} Send message
            </button>
          </form>
        )}
      </div>
    </InfoPage>
  );
}

/* ---------------- Privacy ---------------- */

export function PrivacyPage() {
  return (
    <InfoPage eyebrow="Legal" title="Privacy Policy" updated>
      <p>
        This policy explains what {COMPANY.legalName} ("we") collects when you use Resumint, why, who processes it for us, and the
        choices you have. We keep it short and specific to how the product actually works.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> your name, email address and a one-way hash of your password (we never store the password itself). If you join a team, your organization and role.</li>
        <li><b>Resumes and job descriptions:</b> the files you upload are read into text; we keep the text, the analysis we produce, and any versions you create with Boost, the resume assistant or edits.</li>
        <li><b>What you tell the resume assistant</b> while it's building a proposed update. Only the versions you apply are saved.</li>
        <li><b>Payments:</b> the plan, amount and status of each purchase. Card, UPI and bank details go directly to Razorpay; we never see or store them.</li>
        <li><b>Usage and security records:</b> sign-in times, actions such as purchases and team changes (an audit log), and technical error reports.</li>
        <li><b>Messages</b> you send through our contact or sales forms.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To score your resume, answer questions about it, and create the versions and downloads you ask for.</li>
        <li>To run your account, team seats and billing, and to send service emails: sign-up codes, password resets and team invites.</li>
        <li>To keep the service secure: rate limits, fraud prevention and investigating errors.</li>
      </ul>
      <p>We don't sell your data, use it for advertising, or use your resume to train AI models.</p>
      <h2>Who processes it for us</h2>
      <p>We use these providers to run Resumint. Each receives only what its job needs:</p>
      <ul>
        <li><b>Vercel</b> hosts the website and API.</li>
        <li><b>Supabase</b> stores the database (hosted in Singapore).</li>
        <li><b>Groq</b> and, as a backup, <b>OpenRouter</b> run the AI that reads and scores resumes and drafts edits.</li>
        <li><b>Hugging Face</b> and <b>Pinecone</b> index resume text so the AI recruiter chat can answer questions about it.</li>
        <li><b>Razorpay</b> processes payments.</li>
        <li><b>Google (Gmail)</b> delivers our emails.</li>
      </ul>
      <p>Some of these providers process data outside India. They are bound by their own security and privacy commitments.</p>
      <h2>Cookies and browser storage</h2>
      <p>
        We use one essential cookie, which keeps you signed in for up to 7 days. We don't use advertising or analytics cookies. Your
        browser also remembers your chosen resume template, and a resume dropped on the home page is held in your browser until you
        sign up (at most an hour).
      </p>
      <h2>How long we keep it</h2>
      <p>
        Your data stays while your account is open. Deleting a scan removes its text, analysis and search index. Team admins can
        remove members and jobs. To delete your whole account and everything in it, contact us and we'll do it within 30 days.
        Payment records are kept as long as tax and accounting law requires.
      </p>
      <h2>Your choices and rights</h2>
      <p>
        You can see and delete your scans in the app at any time (Pro users can also download them). You can ask us for a copy of your data, to correct it, or to
        delete it, <ContactLine />. We'll respond within 30 days.
      </p>
      <h2>Security</h2>
      <p>
        Connections are encrypted (HTTPS), passwords are hashed, sessions can be ended from any device by resetting your password, and
        sign-in and sign-up are rate-limited. No system is perfect; if we learn of a breach affecting you, we'll tell you promptly.
      </p>
      <h2>Children</h2>
      <p>Resumint is not for anyone under 16. We don't knowingly collect their data.</p>
      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we'll update the date above and tell signed-in users in the app or by email.</p>
    </InfoPage>
  );
}

/* ---------------- Terms ---------------- */

export function TermsPage() {
  return (
    <InfoPage eyebrow="Legal" title="Terms of Service" updated>
      <p>
        These terms are an agreement between you and {COMPANY.legalName} for using Resumint. By creating an account or using the
        service you agree to them.
      </p>
      <h2>The service</h2>
      <p>
        Resumint analyses resumes with AI and helps you improve them; team plans add job-based screening of applicants. Scores,
        suggestions and rewritten versions are automated opinions to help you, not guarantees of interviews, jobs or hiring outcomes.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16 and give accurate details. Keep your password private; you're responsible for activity on your account.</li>
        <li>Team admins are responsible for the people they invite and for having the right to upload candidates' resumes.</li>
      </ul>
      <h2>Your content and honesty</h2>
      <p>
        You keep ownership of the resumes and details you upload. You give us permission to process them only to provide the
        service. You're responsible for the accuracy of what you submit to employers: review every version before you use it, and
        only add facts that are true.
      </p>
      <h2>Acceptable use</h2>
      <p>Don't misuse Resumint. In particular, don't:</p>
      <ul>
        <li>upload content you have no right to use, or other people's data without a lawful basis;</li>
        <li>try to break, overload, scrape or reverse-engineer the service, or get around plan limits or rate limits;</li>
        <li>use it to create false credentials or mislead employers.</li>
      </ul>
      <h2>Plans and payment</h2>
      <ul>
        <li><b>Free:</b> one resume scan with a summary report.</li>
        <li><b>Pro:</b> ₹99, paid once, for unlimited personal scans and the full feature set for as long as Pro is offered.</li>
        <li><b>Team:</b> ₹2,999 a month or ₹29,990 a year, with extra seats at ₹499 each; renews only when you pay again.</li>
        <li><b>Enterprise:</b> priced by agreement.</li>
      </ul>
      <p>
        Prices are in Indian rupees; any applicable taxes are shown at checkout. Prices may change for future purchases. Payments are processed by
        Razorpay. Refunds follow our <Link to="/refund-policy">Refund and Cancellation Policy</Link>.
      </p>
      <h2>Availability and changes</h2>
      <p>
        We work to keep Resumint available but don't promise it will be uninterrupted. AI providers can be temporarily at capacity. We
        may improve, change or discontinue features, and will give reasonable notice of changes that reduce what you paid for.
      </p>
      <h2>Ending your use</h2>
      <p>
        You can stop using Resumint and ask us to delete your account at any time. We may suspend accounts that break these terms or put
        the service or other users at risk.
      </p>
      <h2>Liability</h2>
      <p>
        The service is provided as is. To the extent the law allows, we aren't liable for indirect or consequential losses, and our total
        liability for any claim is limited to the amount you paid us in the 12 months before it.
      </p>
      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of {COMPANY.country}. If we can't resolve a disagreement informally, it will be handled by the
        courts of {COMPANY.country}.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms? Reach us <ContactLine />.
      </p>
    </InfoPage>
  );
}

/* ---------------- Refunds & cancellation ---------------- */

export function RefundPage() {
  return (
    <InfoPage eyebrow="Legal" title="Refund and Cancellation Policy" updated>
      <h2>Pro (one-time payment)</h2>
      <p>
        If Pro doesn't work as described, ask for a refund within 7 days of paying and we'll refund the full ₹99. Tell us what went wrong
        so we can fix it for others.
      </p>
      <h2>Team plans</h2>
      <ul>
        <li>Team plans don't renew automatically: each month or year is a separate payment, so there is nothing to cancel. Your access runs to the end of the period you paid for.</li>
        <li>If you ask within 7 days of a Team payment and haven't screened resumes in that period, we'll refund it in full.</li>
        <li>Extra seats are refundable within 7 days if no one has joined in them.</li>
      </ul>
      <h2>Payments that didn't go through</h2>
      <p>
        If you were charged but your plan didn't activate, open the Billing page: we check with Razorpay and activate paid orders
        automatically. If it still hasn't activated, contact us and we'll fix it or refund you.
      </p>
      <h2>How refunds are paid</h2>
      <p>
        Approved refunds go back to the original payment method through Razorpay, usually within 5 to 7 business days of approval.
        After a refund, the plan it paid for ends.
      </p>
      <h2>How to ask</h2>
      <p>
        Reach us <ContactLine /> with the email on your account and the payment date. We reply within one business day.
      </p>
    </InfoPage>
  );
}

/* ---------------- Delivery ---------------- */

export function DeliveryPage() {
  return (
    <InfoPage eyebrow="Legal" title="Delivery Policy" updated>
      <p>
        Resumint is an online software service. Nothing is shipped physically, and there are no shipping charges.
      </p>
      <h2>When you get access</h2>
      <ul>
        <li><b>Free:</b> right after you confirm your email.</li>
        <li><b>Pro and Team:</b> as soon as Razorpay confirms your payment, usually within seconds. Your plan shows on the Billing page.</li>
        <li><b>Reports and downloads:</b> scans finish in about a minute; PDF and Word downloads are generated instantly from your account.</li>
      </ul>
      <p>
        If access hasn't appeared a few minutes after paying, open the Billing page to re-check the payment, or <ContactLine />. See the{' '}
        <Link to="/refund-policy">Refund and Cancellation Policy</Link> for payments that fail.
      </p>
    </InfoPage>
  );
}
