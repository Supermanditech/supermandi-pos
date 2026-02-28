/**
 * HELP-001: Shared help/support content component
 * Used by both public (/retailer/help) and protected (/s/:storeCode/help) routes.
 * All links use relative paths for GCP URL parity (staging + production).
 * Styles moved to index.css under .help-* classes for dark mode support.
 */

const SUPPORT_EMAIL = 'hello@supermandi.tech';

export default function HelpPageContent() {
  return (
    <div className="help-container">
      <h1 className="help-title">Help &amp; Support</h1>
      <p className="help-subtitle">Need help? We're here for you.</p>

      {/* Contact Section */}
      <div className="help-card">
        <h3 className="help-card-title">Contact Us</h3>
        <p className="help-no-margin">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="help-email-link">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="help-response-time">We typically respond within 24 hours.</p>
      </div>

      {/* Quick Links */}
      <div className="help-card">
        <h3 className="help-card-title">Quick Links</h3>
        <ul className="help-link-list">
          <li>
            <span className="help-link-label">Retailer Portal:</span>
            <a href="/retailer/" className="help-link">supermandi.tech/retailer</a>
          </li>
          <li>
            <span className="help-link-label">Download POS App:</span>
            <a href="/pos" className="help-link">supermandi.tech/pos</a>
          </li>
          <li>
            <span className="help-link-label">Supplier Portal:</span>
            <a href="/supplier/" className="help-link">supermandi.tech/supplier</a>
          </li>
        </ul>
      </div>

      {/* Legal */}
      <div className="help-card">
        <h3 className="help-card-title">Legal</h3>
        <ul className="help-link-list">
          <li>
            <a href="/terms" className="help-link">Terms of Service</a>
          </li>
          <li>
            <a href="/privacy" className="help-link">Privacy Policy</a>
          </li>
        </ul>
      </div>

      {/* Company Info */}
      <div className="help-company">
        <p className="help-no-margin">SuperMandi Tech Pvt Ltd</p>
      </div>
    </div>
  );
}
