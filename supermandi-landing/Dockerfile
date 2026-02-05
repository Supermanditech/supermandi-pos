# Landing Page - Production Dockerfile
# FRONTEND-CR-201: Static HTML served by nginx (Cloud Run-ready)

FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/index.html

# Add health check file
RUN echo "OK" > /usr/share/nginx/html/health.txt

# Simple nginx config for static site
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
