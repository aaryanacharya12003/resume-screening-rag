import { DragEvent, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicNav } from '../../components/PublicNav';
import { Footer } from '../../components/Footer';
import { ContactSales, PricingPlans } from '../../components/Pricing';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../lib/auth';
import { setPendingResume } from '../../lib/pending';

const REWRITES: Array<{ label: string; before: string; after: ReactNode; tip: string }> = [
  {
    label: 'Marketing',
    before: 'Responsible for managing the team and doing the marketing for the product.',
    after: <>Led a <span className="mark">6-person growth team</span> that shipped 14 campaigns and lifted sign-ups <span className="mark green">38% in two quarters.</span></>,
    tip: '+ Adds scale, ownership and a measurable result',
  },
  {
    label: 'Engineering',
    before: 'Worked on the backend and fixed bugs in the payments service.',
    after: <>Rebuilt the <span className="mark">payments retry queue</span>, cutting failed transactions <span className="mark green">from 2.1% to 0.4%</span> across 1.2M monthly orders.</>,
    tip: '+ Names the system and proves the outcome',
  },
  {
    label: 'Sales',
    before: 'Handled client accounts and helped with sales targets.',
    after: <>Owned <span className="mark">42 mid-market accounts</span> and closed <span className="mark green">₹1.8 Cr in new ARR</span>, 126% of annual quota.</>,
    tip: '+ Replaces "helped" with ownership and numbers',
  },
];

const FAQ: Array<[string, string]> = [
  ['How much does Resumint cost?', 'Your first scan is free. Unlimited personal access to every check, rewrite, JD match and AI chat is a one-time ₹99. Hiring teams use the Team plan (₹2,999/month) or Enterprise.'],
  ['What does Resumint actually analyze?', 'Formatting and ATS parsing, keyword coverage, bullet strength, measurable impact, readability, section order and 25+ other checks that recruiters care about.'],
  ['How is this different from a free ATS checker?', 'Most checkers stop at a score. Resumint explains every issue, shows why it matters, gives rewritten bullets, and lets you chat with an AI recruiter grounded in your own resume.'],
  ['Can my hiring team use Resumint?', 'Yes. Team and Enterprise plans add recruiter seats, job postings, bulk screening that ranks every applicant against the job description, and CSV export.'],
  ['Is my resume data safe?', 'Files are used only for your analysis. We never share them with employers or third parties, and you can delete any scan at any time.'],
];

export default function Landing() {
  const nav = useNavigate();
  const toast = useToast();
  const { me } = useAuth();
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState(0);

  const pick = (file?: File | null) => {
    if (!file) return;
    if (!/\.(pdf|txt)$/i.test(file.name)) return toast('Please upload a PDF or .txt file', true);
    if (file.size > 4 * 1024 * 1024) return toast('That file is over 4 MB', true);
    setPendingResume(file);
    nav(me ? '/app/scan' : '/register?next=/app/scan');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files?.[0]);
  };
  const r = REWRITES[tab];

  return (
    <>
      <PublicNav />
      <main id="top">
        <div className="wrap">
          <section className="hero">
            <div className="hero__copy">
              <span className="badge"><b>New</b> Bulk screening for hiring teams is live</span>
              <h1 className="display h1">Know exactly what's wrong with your resume <span className="mark">before you apply.</span></h1>
              <p className="lede">Resumint reads your resume the way a recruiter and an ATS do, then tells you line by line what to fix and how to fix it.</p>
              <div className="proof">
                <div className="faces" aria-hidden="true">
                  <span style={{ background: 'var(--accent)' }}>SR</span><span style={{ background: 'var(--blue)' }}>AV</span><span style={{ background: 'var(--pink)' }}>FM</span><span style={{ background: 'var(--green)' }}>KN</span>
                </div>
                <div><span className="stars" aria-label="Rated 4.9 out of 5">★★★★★</span><br />12,400+ resumes reviewed</div>
              </div>
            </div>

            <div className="upload" id="upload">
              <span className="upload__note hand" aria-hidden="true">drop it here!</span>
              <label
                className={`drop${over ? ' is-over' : ''}`}
                htmlFor="file"
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <span className="drop__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
                </span>
                <strong>Drop your resume here or browse</strong>
                <small>PDF or TXT · up to 4 MB</small>
                <span className="btn btn--sm btn--light">Choose file</span>
              </label>
              <input className="sr-only" type="file" id="file" accept=".pdf,.txt" onChange={(e) => pick(e.target.files?.[0])} />
              <div className="upload__foot"><span>Free first scan · 30-second sign-up</span><span>Results in ~20 seconds</span></div>
            </div>
          </section>
        </div>

        <div className="band">
          <div className="wrap">
            <p>Tuned to the standards expected by recruiters at top companies</p>
            <ul aria-label="Example companies"><li>Brightloop</li><li>Kestrel</li><li>Nimbus&amp;Co</li><li>Orbitly</li><li>Tandem</li><li>Vantage Labs</li></ul>
          </div>
        </div>

        <section className="section" id="how">
          <div className="wrap split">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div className="head" style={{ margin: 0 }}>
                <p className="eyebrow">How it works</p>
                <h2 className="display h2">Make your resume <span className="scrawl">impossible</span> to ignore.</h2>
              </div>
              <div className="issues">
                <div className="issue"><span className="issue__k" style={{ color: 'var(--accent)' }}>● 1 · DIAGNOSE</span><p>See exactly what's wrong with your resume, ranked by how much it costs you.</p></div>
                <div className="issue"><span className="issue__k" style={{ color: 'var(--pink)' }}>● 2 · COMPARE</span><p>Match against a real job description and see what recruiters expect to find.</p></div>
                <div className="issue"><span className="issue__k" style={{ color: 'var(--blue)' }}>● 3 · IMPROVE</span><p>Fix bullets, structure and keywords with ready-to-use rewrites and an AI recruiter chat.</p></div>
                <div className="issue"><span className="issue__k" style={{ color: 'var(--green)' }}>● 4 · APPLY</span><p>Send a sharper application with confidence, and re-scan every new version.</p></div>
              </div>
            </div>
            <div className="compare">
              <div className="compare__card compare__card--before">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>Before Resumint</b><span className="pill pill--bad">52 / 100</span></div>
                <div className="compare__row"><span>ATS compatibility</span><b>61</b></div>
                <div className="compare__row"><span>Recruiter readability</span><b>48</b></div>
                <div className="compare__row"><span>Keyword match</span><b>34</b></div>
                <div className="compare__row" style={{ border: 0 }}><span>Measurable impact</span><b>27%</b></div>
              </div>
              <div className="compare__card compare__card--after">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>After Resumint</b><span className="pill pill--good">86 / 100</span></div>
                <div className="meters">
                  <div className="meter"><span>ATS</span><div className="track"><span style={{ width: '94%', background: 'var(--green)' }} /></div><b>94</b></div>
                  <div className="meter"><span>Readability</span><div className="track"><span style={{ width: '88%', background: 'var(--blue)' }} /></div><b>88</b></div>
                  <div className="meter"><span>Keywords</span><div className="track"><span style={{ width: '79%', background: 'var(--accent)' }} /></div><b>79</b></div>
                  <div className="meter"><span>Impact</span><div className="track"><span style={{ width: '82%', background: 'var(--pink)' }} /></div><b>82</b></div>
                </div>
              </div>
              <span className="compare__note hand" aria-hidden="true">+34 points ↗</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">Recruiter view</p>
              <h2 className="display h2">See your resume through <span className="mark pink">a recruiter's eyes.</span></h2>
              <p className="lede">Recruiters spend about seven seconds on a first pass. Resumint shows you what they notice, and what they skip.</p>
            </div>
            <div className="recruiter">
              <div className="recruiter__bar" aria-hidden="true"><i /><i /><i /></div>
              <div className="recruiter__doc">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <h3>Ananya Iyer</h3><span className="timer">⏱ 7.2s skim</span>
                </div>
                <span className="recruiter__meta">Senior Product Designer · Pune · ananya.iyer@mail.com</span>
                <div className="line" style={{ width: '92%' }} />
                <div className="line hl" style={{ width: '64%' }} />
                <div className="line" style={{ width: '80%' }} />
                <span className="recruiter__flag">⚑ Seen: title, last company, one metric</span>
                <div className="line" style={{ width: '70%', opacity: 0.5 }} />
                <div className="line" style={{ width: '86%', opacity: 0.35 }} />
                <div className="line" style={{ width: '58%', opacity: 0.25 }} />
                <span className="recruiter__meta">Skipped: 6 of 9 bullets under "Experience". They start with "Responsible for".</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="checks">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">What we check</p>
              <h2 className="display h2">30+ ways to find what's <em>holding your resume back.</em></h2>
            </div>
            <div className="cloud">
              {[
                ['t-y', 'Quantified impact'], ['t-b', 'ATS parsing'], ['t-p', 'Weak action verbs'], ['t-g', 'Skills gap'], ['t-o', 'Bullet length'], ['t-c', 'Buzzwords'],
                ['t-b', 'Keyword match'], ['t-y', 'Readability'], ['t-p', 'Date formatting'], ['t-g', 'Section order'], ['t-o', 'Contact info'], ['t-y', 'Repeated words'],
                ['t-c', 'Passive voice'], ['t-b', 'File format'], ['t-g', 'Leadership signals'], ['t-p', 'Links & portfolio'], ['t-o', 'Page length'], ['t-y', 'Job-title alignment'],
              ].map(([c, t]) => <span key={t} className={`tag ${c}`}>{t}</span>)}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap split">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p className="eyebrow">Job-description matching</p>
              <h2 className="display h2">Built for the job you're <span className="mark">actually applying for.</span></h2>
              <p className="lede">Add a job post and Resumint shows which skills you already prove, which ones you're missing, and where to add them. No keyword stuffing.</p>
              <Link className="btn btn--accent" to={me ? '/app/scan' : '/register'} style={{ alignSelf: 'flex-start' }}>Match my resume <span className="arrow">→</span></Link>
            </div>
            <div className="match">
              <label>Example: Product Designer role</label>
              <p style={{ fontSize: 14, opacity: 0.85 }}>"We're hiring a Product Designer with strong Figma skills, experience building design systems, user research, and working with engineers on accessibility and prototyping."</p>
              <div className="kw">
                <span className="have">✓ figma</span><span className="have">✓ design systems</span><span className="have">✓ prototyping</span>
                <span className="miss">+ user research</span><span className="miss">+ accessibility</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">Bullet rewrites</p>
              <h2 className="display h2">From weak bullets to <em>stronger stories.</em></h2>
              <p className="lede">Resumint rewrites vague responsibilities into clear, measurable achievements, in your own voice.</p>
            </div>
            <div className="rewrite">
              <span className="rewrite__note hand" aria-hidden="true">much better!</span>
              <div className="rewrite__tabs" role="tablist" aria-label="Example rewrites">
                {REWRITES.map((w, i) => (
                  <button key={w.label} role="tab" aria-selected={i === tab} type="button" onClick={() => setTab(i)}>{w.label}</button>
                ))}
              </div>
              <p className="eyebrow">Before</p>
              <p className="rewrite__before"><span className="strike">{r.before}</span></p>
              <p className="eyebrow">After</p>
              <p className="rewrite__after">{r.after}</p>
              <span className="rewrite__tip">{r.tip}</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap split">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p className="eyebrow">For hiring teams</p>
              <h2 className="display h2">Screen 500 applicants <span className="mark blue">before lunch.</span></h2>
              <p className="lede">Post a job, drop in every resume, and Resumint ranks candidates against the job description with strengths, gaps and missing skills. Ask the AI follow-up questions about any candidate.</p>
              <div className="row">
                <Link className="btn" to="/register?type=team">Start a team <span className="arrow">→</span></Link>
                <Link className="btn btn--light" to="/pricing#enterprise">Talk to sales</Link>
              </div>
            </div>
            <div className="card card--ink" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table">
                <thead><tr><th>#</th><th>Candidate</th><th className="num">Fit</th></tr></thead>
                <tbody>
                  {[['Kavya Nair', 88, 'score-hi'], ['Vikram Rao', 78, 'score-hi'], ['Neha Kapoor', 64, 'score-mid'], ['Dev Malhotra', 32, 'score-lo']].map(([n, s, c], i) => (
                    <tr key={n as string}><td>{i + 1}</td><td><b>{n}</b></td><td className="num"><span className={`score-badge ${c}`}>{s}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">Reviews</p>
              <h2 className="display h2">Don't just take <em>our</em> word for it.</h2>
            </div>
            <div className="quotes">
              <figure className="quote"><span className="stars" aria-label="5 stars">★★★★★</span>
                <blockquote>I'd sent the same resume to forty roles. Resumint flagged that <span className="mark">none of my bullets had a number</span>. I got two callbacks the next week.</blockquote>
                <figcaption className="who"><span className="av" style={{ background: 'var(--accent)' }}>SR</span><div><b>Sneha R.</b><small>Data Analyst</small></div></figcaption></figure>
              <figure className="quote"><span className="stars" aria-label="5 stars">★★★★★</span>
                <blockquote>The keyword gap list was eerily specific. It read the job post <span className="mark pink">better than I did.</span></blockquote>
                <figcaption className="who"><span className="av" style={{ background: 'var(--blue)' }}>AV</span><div><b>Aditya V.</b><small>Backend Engineer</small></div></figcaption></figure>
              <figure className="quote"><span className="stars" aria-label="5 stars">★★★★★</span>
                <blockquote>We screen 300 applicants per role. Resumint's ranking <span className="mark green">cut our first pass from days to an hour.</span></blockquote>
                <figcaption className="who"><span className="av" style={{ background: 'var(--pink)' }}>FM</span><div><b>Farah M.</b><small>Talent Lead</small></div></figcaption></figure>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <div className="wrap">
            <div className="head head--center">
              <p className="eyebrow">Pricing</p>
              <h2 className="display h2">Try it free. <span className="mark">Keep it for ₹99.</span></h2>
              <p className="lede">Plans for job seekers, recruiters and whole talent teams.</p>
            </div>
            <PricingPlans />
            <p style={{ textAlign: 'center', marginTop: 24 }}><Link className="link" to="/pricing">Compare every feature →</Link></p>
          </div>
        </section>

        <section className="section" id="enterprise">
          <div className="wrap split">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p className="eyebrow">Enterprise</p>
              <h2 className="display h2">Hiring at scale? <em>Let's talk.</em></h2>
              <p className="lede">Unlimited seats and screening, SSO, API access, white-label reports, security reviews and a 99.9% SLA.</p>
            </div>
            <ContactSales />
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap">
            <div className="head head--center"><p className="eyebrow">FAQ</p><h2 className="display h2">Still wondering?</h2></div>
            <div className="faq">
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0}>
                  <summary>{q}<span className="plus" aria-hidden="true">+</span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="wrap">
            <span className="cta__note hand" aria-hidden="true">you've got this ↓</span>
            <h2 className="display h2">Still not sure?</h2>
            <p>Your next interview might be one fix away. Check your resume before you apply.</p>
            <Link className="btn btn--accent" to={me ? '/app/scan' : '/register'}>Get my free resume score <span className="arrow">→</span></Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
