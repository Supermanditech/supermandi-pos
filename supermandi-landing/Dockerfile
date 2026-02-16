# Landing Page - Production Dockerfile
# FRONTEND-CR-201: Static HTML served by nginx (Cloud Run-ready)

FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/index.html
COPY privacy.html /usr/share/nginx/html/privacy.html
COPY terms.html /usr/share/nginx/html/terms.html
COPY pos.html /usr/share/nginx/html/pos.html

# Add health check file
RUN echo "OK" > /usr/share/nginx/html/health.txt

# URL-001 + URL-003: Security headers, cache-control, proper 404 for unknown paths
# Note: nginx location blocks with add_header OVERRIDE server-level add_header,
# so every location must include the full security header set (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

USER nginx
CMD ["nginx", "-g", "daemon off;"]
