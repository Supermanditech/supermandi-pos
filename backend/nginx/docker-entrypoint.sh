#!/bin/sh
# GO-LIVE-078: NGINX entrypoint script for environment variable substitution
# Generates nginx.conf from template using envsubst

set -e

# Default values
SSL_DOMAIN="${SSL_DOMAIN:-34.14.220.171.nip.io}"
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

# Check if template exists
TEMPLATE_PATH="/etc/nginx/templates/nginx.prod.conf.template"
OUTPUT_PATH="/etc/nginx/conf.d/default.conf"

if [ -f "${TEMPLATE_PATH}" ]; then
    # Generate config from template
    # Note: We use $$ to escape nginx variables like $host, $scheme, etc.
    # envsubst only replaces shell variables (prefixed with $)
    envsubst '${SSL_DOMAIN} ${SERVER_NAMES} ${API_RATE_LIMIT} ${AUTH_RATE_LIMIT}' \
        < "${TEMPLATE_PATH}" \
        > "${OUTPUT_PATH}"
    echo "Configuration generated: ${OUTPUT_PATH}"
else
    echo "Template not found at ${TEMPLATE_PATH}, using default config"
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
