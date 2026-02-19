/**
 * HELP-001: Shared help/support content component
 * Used by both public (/retailer/help) and protected (/s/:storeCode/help) routes.
 * All links use relative paths for GCP URL parity (staging + production).
 */

const SUPPORT_EMAIL = 'hello@supermandi.tech';

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#0F172A',
    marginBottom: '0.25rem',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '0.9375rem',
    marginBottom: '2rem',
  },
  card: {
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: 12,
    padding: '1.25rem',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontWeight: 600,
    color: '#0F172A',
    fontSize: '0.9375rem',
    marginBottom: '0.75rem',
  },
  emailLink: {
    color: '#2563eb',
    fontWeight: 500,
    textDecoration: 'none',
    fontSize: '0.9375rem',
  },
  responseTime: {
    color: '#94A3B8',
    fontSize: '0.8125rem',
    marginTop: '0.5rem',
  },
  linkList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  link: {
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  linkLabel: {
    color: '#64748b',
    fontSize: '0.8125rem',
    fontWeight: 400,
    marginRight: '0.5rem',
  },
  company: {
    textAlign: 'center' as const,
    color: '#94A3B8',
    fontSize: '0.8125rem',
    marginTop: '2rem',
    lineHeight: 1.6,
  },
};

export default function HelpPageContent() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Help &amp; Support</h1>
      <p style={styles.subtitle}>Need help? We're here for you.</p>

      {/* Contact Section */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Contact Us</h3>
        <p style={{ margin: 0 }}>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={styles.emailLink}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p style={styles.responseTime}>We typically respond within 24 hours.</p>
      </div>

      {/* Quick Links */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Quick Links</h3>
        <ul style={styles.linkList}>
          <li>
            <span style={styles.linkLabel}>Retailer Portal:</span>
            <a href="/retailer/" style={styles.link}>supermandi.tech/retailer</a>
          </li>
          <li>
            <span style={styles.linkLabel}>Download POS App:</span>
            <a href="/pos" style={styles.link}>supermandi.tech/pos</a>
          </li>
          <li>
            <span style={styles.linkLabel}>Supplier Portal:</span>
            <a href="/supplier/" style={styles.link}>supermandi.tech/supplier</a>
          </li>
        </ul>
      </div>

      {/* Legal */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Legal</h3>
        <ul style={styles.linkList}>
          <li>
            <a href="/terms" style={styles.link}>Terms of Service</a>
          </li>
          <li>
            <a href="/privacy" style={styles.link}>Privacy Policy</a>
          </li>
        </ul>
      </div>

      {/* Company Info */}
      <div style={styles.company}>
        <p style={{ margin: 0 }}>SuperMandi Tech Pvt Ltd</p>
        <p style={{ margin: 0 }}>Made in India</p>
      </div>
    </div>
  );
}
