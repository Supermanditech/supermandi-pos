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
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
    location = /privacy {\n\
        try_files /privacy.html =404;\n\
        add_header Cache-Control "no-cache" always;\n\
        add_header X-Frame-Options "DENY" always;\n\
        add_header X-Content-Type-Options "nosniff" always;\n\
    }\n\
    location = /terms {\n\
        try_files /terms.html =404;\n\
        add_header Cache-Control "no-cache" always;\n\
        add_header X-Frame-Options "DENY" always;\n\
        add_header X-Content-Type-Options "nosniff" always;\n\
    }\n\
    location = /pos {\n\
        try_files /pos.html =404;\n\
        add_header Cache-Control "no-cache" always;\n\
        add_header X-Frame-Options "DENY" always;\n\
        add_header X-Content-Type-Options "nosniff" always;\n\
    }\n\
    location = / {\n\
        try_files /index.html =404;\n\
        add_header Cache-Control "no-cache" always;\n\
        add_header X-Frame-Options "DENY" always;\n\
        add_header X-Content-Type-Options "nosniff" always;\n\
    }\n\
    location / {\n\
        try_files $uri =404;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
