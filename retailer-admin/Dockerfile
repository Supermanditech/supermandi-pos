# Retailer Admin Portal - Production Dockerfile
# GO-LIVE-B9: Batch 9 UI Testing deployment
# ENV-001: Build-time ENV Injection

FROM node:20-alpine AS builder

WORKDIR /app

# ENV-001: Build-time environment variables
# FRONTEND-CR-201: No hardcoded domain — set at build time via --build-arg
ARG VITE_API_BASE_URL=""
ARG VITE_GIT_SHA=dev
ARG VITE_BUILD_TIME
# STAGING-FIX-007: Firebase config comes from .env.production (NOT Docker ARGs)
# Removed empty ARG/ENV for VITE_FIREBASE_* — empty strings override .env.production
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ENV VITE_BUILD_TIME=$VITE_BUILD_TIME

# Copy package files + lockfile
COPY package.json pnpm-lock.yaml ./

# DEPLOY-388: Use pnpm for deterministic builds (lockfile exists)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build with production env (use .env.production.example as fallback)
RUN if [ -f .env.production ]; then cp .env.production .env; \
    elif [ -f .env.production.example ]; then cp .env.production.example .env; \
    fi

# ENV-001: Set build time if not provided
RUN if [ -z "$VITE_BUILD_TIME" ]; then export VITE_BUILD_TIME=$(date -Iseconds); fi && pnpm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config (subpath-aware: serves SPA under /retailer/ prefix)
COPY nginx-local-prod.conf /etc/nginx/conf.d/default.conf

# Add health check
RUN echo "OK" > /usr/share/nginx/html/health.txt

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

USER nginx
CMD ["nginx", "-g", "daemon off;"]
