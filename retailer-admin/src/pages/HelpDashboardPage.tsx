/**
 * HELP-001: Protected Help & Support page (post-login)
 * Accessible at /s/:storeCode/help inside ProtectedLayout sidebar.
 * Renders shared HelpPageContent inside the Outlet.
 */

import HelpPageContent from '../components/HelpPageContent';

export default function HelpDashboardPage() {
  return <HelpPageContent />;
}
