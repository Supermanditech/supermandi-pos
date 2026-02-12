import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BuildStamp } from '../components/BuildStamp';

// GO-LIVE-AUTH: OTP-only model — no password reset needed
// Matches supplier portal: redirect users to login for OTP-based auth

const styles = {
  pageContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#F7F9FC',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
  },
  headerInner: {
    maxWidth: '1152px',
    width: '100%',
    margin: '0 auto',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#2563eb',
  },
  logoSeparator: {
    color: '#94a3b8',
  },
  logoSubtext: {
    color: '#475569',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '448px',
  },
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
  },
  cardTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#0F172A',
    marginBottom: '0.5rem',
  },
  infoBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  bodyText: {
    color: '#64748b',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
    lineHeight: 1.5,
  },
  btnPrimary: {
    width: '100%',
    height: '46px',
    padding: '0 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'white',
    background: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    background: 'white',
    borderTop: '1px solid #e2e8f0',
  },
  footerInner: {
    maxWidth: '1152px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.8125rem',
    color: '#64748b',
  },
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  // Auto-redirect to login after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/retailer/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={styles.pageContainer}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SuperManditech</span>
            <span style={styles.logoSeparator}>|</span>
            <span style={styles.logoSubtext}>Retailer Portal</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={styles.main}>
        <div style={styles.cardContainer}>
          <div style={styles.card}>
            <h1 style={styles.cardTitle}>Password Not Required</h1>

            <div style={styles.infoBox}>
              <p style={{ fontWeight: 500, margin: '0 0 0.25rem' }}>OTP-Only Authentication</p>
              <p style={{ margin: 0 }}>
                The Retailer Portal uses phone OTP verification for login. No password is required.
              </p>
            </div>

            <p style={styles.bodyText}>
              Simply go to the login page and enter your phone number to receive an OTP.
              You will be redirected automatically...
            </p>

            <Link to="/retailer/login" style={styles.btnPrimary}>
              Go to Login
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
