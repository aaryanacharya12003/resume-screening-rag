import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__cols">
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/#how">How it works</Link></li>
              <li><Link to="/#checks">What we check</Link></li>
              <li><Link to="/pricing">Pricing</Link></li>
              <li><Link to="/#faq">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4>Teams</h4>
            <ul>
              <li><Link to="/pricing#plans">Team plan</Link></li>
              <li><Link to="/pricing#enterprise">Enterprise</Link></li>
              <li><Link to="/register?type=team">Create a team account</Link></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><Link to="/refund-policy">Refunds &amp; Cancellation</Link></li>
              <li><Link to="/delivery-policy">Delivery Policy</Link></li>
            </ul>
          </div>
          <div className="footer__cta">
            <p>Fix your resume before you apply.</p>
            <Link className="btn btn--sm" to="/register">Get my free score →</Link>
          </div>
        </div>
        <p className="wordmark" aria-hidden="true">Resumint</p>
        <div className="footer__legal">
          <span>© 2026 Resumint. All rights reserved.</span>
          <span>Made for people who hit “Apply” a lot.</span>
        </div>
      </div>
    </footer>
  );
}
