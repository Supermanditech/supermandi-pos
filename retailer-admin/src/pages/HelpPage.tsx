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
        <div className="login-footer-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/retailer/login" style={{ color: 'inherit', fontSize: '0.75rem', textDecoration: 'none' }}>Sign In</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
