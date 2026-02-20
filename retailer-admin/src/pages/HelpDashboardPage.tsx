/**
 * HELP-001: Protected Help & Support page (post-login)
 * Accessible at /s/:storeCode/help inside ProtectedLayout sidebar.
 * Renders shared HelpPageContent inside the Outlet.
 */

import { useParams } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import HelpPageContent from '../components/HelpPageContent';

export default function HelpDashboardPage() {
  const { storeCode } = useParams();
  return (
    <>
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Help & Support' }]} />
      <HelpPageContent />
    </>
  );
}
