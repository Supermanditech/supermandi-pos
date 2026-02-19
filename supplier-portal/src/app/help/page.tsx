/**
 * HELP-001: Help & Support page for Supplier Portal.
 * Accessible at /supplier/help without authentication.
 * All links use relative paths for GCP URL parity (staging + production).
 */

const SUPPORT_EMAIL = 'hello@supermandi.tech';

export default function HelpPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Help &amp; Support</h1>
      <p className="text-slate-500 text-sm mb-8">Need help? We&apos;re here for you.</p>

      {/* Contact Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Contact Us</h3>
        <p className="text-sm mb-1">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 font-medium hover:text-blue-700">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-slate-400 text-xs">We typically respond within 24 hours.</p>
      </div>

      {/* Quick Links */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Quick Links</h3>
        <ul className="space-y-2 text-sm">
          <li>
            <span className="text-slate-500 text-xs mr-2">Supplier Portal:</span>
            <a href="/supplier/" className="text-blue-600 font-medium hover:text-blue-700">supermandi.tech/supplier</a>
          </li>
          <li>
            <span className="text-slate-500 text-xs mr-2">Retailer Portal:</span>
            <a href="/retailer/" className="text-blue-600 font-medium hover:text-blue-700">supermandi.tech/retailer</a>
          </li>
          <li>
            <span className="text-slate-500 text-xs mr-2">Download POS App:</span>
            <a href="/pos" className="text-blue-600 font-medium hover:text-blue-700">supermandi.tech/pos</a>
          </li>
        </ul>
      </div>

      {/* Legal */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Legal</h3>
        <ul className="space-y-2 text-sm">
          <li><a href="/terms" className="text-blue-600 font-medium hover:text-blue-700">Terms of Service</a></li>
          <li><a href="/privacy" className="text-blue-600 font-medium hover:text-blue-700">Privacy Policy</a></li>
        </ul>
      </div>

      {/* Company */}
      <div className="text-center text-slate-400 text-xs mt-8">
        <p>SuperMandi Tech Pvt Ltd</p>
        <p>Made in India</p>
      </div>
    </>
  );
}
