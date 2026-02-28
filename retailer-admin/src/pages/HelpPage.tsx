/**
 * HELP-001: Public Help & Support page (pre-login)
 * Accessible at /retailer/help without authentication.
 * Layout matches LoginPage structure for visual consistency.
 */

import { Link } from 'react-router-dom';
import { BuildStamp } from '../components/BuildStamp';
import HelpPageContent from '../components/HelpPageContent';
import { ThemeToggle } from '../components/ThemeToggle';

export default function HelpPage() {
  return (
    <div className="login-page-container">
      {/* T-095: Unified login header — same as LoginPage */}
      <header className="login-header">
        <div className="login-header-inner">
          <div className="login-logo">
            <img className="brand-mark brand-mark-light" src="/retailer/brand/logo-shortmark.svg" alt="" width={20} height={20} />
            <img className="brand-mark brand-mark-dark" src="/retailer/brand/logo-shortmark-inverse.svg" alt="" width={20} height={20} />
            <span className="login-logo-text">SuperMandi</span>
            <span className="login-logo-separator">|</span>
            <span className="login-logo-subtext">Retailer Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="login-main">
        <HelpPageContent />
      </main>

      {/* Footer */}
      <footer className="login-footer">
        <div className="login-footer-inner login-footer-layout">
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
          <div className="login-footer-links">
            <Link to="/retailer/login" className="login-footer-link">Sign In</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
