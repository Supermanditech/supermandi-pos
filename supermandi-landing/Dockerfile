# Landing Page - Production Dockerfile
# FRONTEND-CR-201: Static HTML served by nginx (Cloud Run-ready)

FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/index.html
COPY privacy.html /usr/share/nginx/html/privacy.html
COPY terms.html /usr/share/nginx/html/terms.html
COPY pos.html /usr/share/nginx/html/pos.html
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY sitemap.xml /usr/share/nginx/html/sitemap.xml
COPY brand/ /usr/share/nginx/html/brand/

# Add health check file
RUN echo "OK" > /usr/share/nginx/html/health.txt

# URL-001 + URL-003: Security headers, cache-control, proper 404 for unknown paths
# Note: nginx location blocks with add_header OVERRIDE server-level add_header,
# so every location must include the full security header set (see nginx.conf).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run read-only filesystem: redirect nginx writable paths to /tmp
RUN sed -i '/^pid/c\pid /tmp/nginx.pid;' /etc/nginx/nginx.conf && \
    printf 'client_body_temp_path /tmp/client_temp;\nproxy_temp_path /tmp/proxy_temp;\nfastcgi_temp_path /tmp/fastcgi_temp;\nuwsgi_temp_path /tmp/uwsgi_temp;\nscgi_temp_path /tmp/scgi_temp;\n' > /etc/nginx/conf.d/cloud-run-paths.conf && \
    mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

EXPOSE 80

USER nginx
CMD ["nginx", "-g", "daemon off;"]
