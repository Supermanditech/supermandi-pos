# SuperAdmin Portal - Production Dockerfile
# CR-DOCKER-001: Cloud Run-ready Vite SPA served by nginx
# FRONTEND-CR-201: No hardcoded domains in ARG defaults

FROM node:20-alpine AS builder

WORKDIR /app

# FRONTEND-CR-201: Build-time env vars — set at build time, not hardcoded
ARG VITE_API_BASE_URL=""
ARG VITE_GIT_SHA=unknown
ARG VITE_BUILD_TIME
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ENV VITE_BUILD_TIME=$VITE_BUILD_TIME

# Copy package files
COPY package*.json ./

# Install dependencies (npm install: no lockfile in pnpm-managed project)
RUN npm install

# Copy source
COPY . .

# Build
RUN if [ -z "$VITE_BUILD_TIME" ]; then export VITE_BUILD_TIME=$(date -Iseconds); fi && npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config (subpath-aware: serves SPA under /admin/ prefix)
COPY nginx-local-prod.conf /etc/nginx/conf.d/default.conf

# Add health check file
RUN echo "OK" > /usr/share/nginx/html/health.txt

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

USER nginx
CMD ["nginx", "-g", "daemon off;"]
