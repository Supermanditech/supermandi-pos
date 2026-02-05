#!/bin/sh
# GO-LIVE-078: NGINX entrypoint script for environment variable substitution
# Generates nginx.conf from template using envsubst
# GO-LIVE-B9: Updated for supermandi.tech production domain

set -e

# Default values - GO-LIVE-B9: supermandi.tech as primary domain
SSL_DOMAIN="${SSL_DOMAIN:-supermandi.tech}"
SERVER_NAMES="${SERVER_NAMES:-${SSL_DOMAIN} api.supermandi.com _}"
API_RATE_LIMIT="${API_RATE_LIMIT:-30}"
AUTH_RATE_LIMIT="${AUTH_RATE_LIMIT:-5}"

# Export for envsubst
export SSL_DOMAIN SERVER_NAMES API_RATE_LIMIT AUTH_RATE_LIMIT

echo "Generating nginx configuration..."
echo "  SSL_DOMAIN: ${SSL_DOMAIN}"
echo "  SERVER_NAMES: ${SERVER_NAMES}"
echo "  API_RATE_LIMIT: ${API_RATE_LIMIT}r/m"
echo "  AUTH_RATE_LIMIT: ${AUTH_RATE_LIMIT}r/m"

# GO-LIVE-B9: Remove any existing default.conf that might interfere
# This ensures our production config is the only one serving requests
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Check if template exists
TEMPLATE_PATH="/etc/nginx/templates/nginx.prod.conf.template"
OUTPUT_PATH="/etc/nginx/conf.d/nginx.prod.conf"

if [ -f "${TEMPLATE_PATH}" ]; then
    # Generate config from template
    # Note: We use $$ to escape nginx variables like $host, $scheme, etc.
    # envsubst only replaces shell variables (prefixed with $)
    envsubst '${SSL_DOMAIN} ${SERVER_NAMES} ${API_RATE_LIMIT} ${AUTH_RATE_LIMIT}' \
        < "${TEMPLATE_PATH}" \
        > "${OUTPUT_PATH}"
    echo "Configuration generated: ${OUTPUT_PATH}"
    # List active configs
    echo "Active nginx configs:"
    ls -la /etc/nginx/conf.d/
else
    echo "ERROR: Template not found at ${TEMPLATE_PATH}"
    echo "NGINX will not start correctly without production config"
    exit 1
fi

# Verify SSL certificates exist
CERT_PATH="/etc/letsencrypt/live/${SSL_DOMAIN}/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/${SSL_DOMAIN}/privkey.pem"

if [ -f "${CERT_PATH}" ] && [ -f "${KEY_PATH}" ]; then
    echo "SSL certificates found for ${SSL_DOMAIN}"
else
    echo "WARNING: SSL certificates not found at ${CERT_PATH}"
    echo "         HTTPS will not work until certificates are installed"
fi

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# Execute the original entrypoint
exec "$@"
