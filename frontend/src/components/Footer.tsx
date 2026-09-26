import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__cols">
          <div><h4>Product</h4><ul><li><a href="/#how">How it works</a></li><li><Link to="/pricing">Pricing</Link></li><li><a href="/#faq">FAQ</a></li></ul></div>
          <div><h4>Teams</h4><ul><li><Link to="/register?type=team">Team plan</Link></li><li><Link to="/pricing#enterprise">Enterprise</Link></li></ul></div>
          <div><h4>Legal</h4><ul><li><a href="#">Privacy Policy</a></li><li><a href="#">Terms of Service</a></li></ul></div>
          <div className="footer__cta"><p>Fix your resume before you apply.</p><Link className="btn btn--sm" to="/register">Get my free score →</Link></div>
        </div>
        <p className="wordmark" aria-hidden="true">Resumint</p>
        <div className="footer__legal"><span>© 2026 Resumint. All rights reserved.</span><span>Made for people who hit “Apply” a lot.</span></div>
      </div>
    </footer>
  );
}
