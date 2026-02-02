# Retailer Admin Portal - Production Dockerfile
# GO-LIVE-B9: Batch 9 UI Testing deployment
# ENV-001: Build-time ENV Injection

FROM node:20-alpine AS builder

WORKDIR /app

# ENV-001: Build-time environment variables
# OPS-DOMAIN-001: Base URL only - API client appends /api/v1/retailer-admin internally
ARG VITE_API_BASE_URL=https://supermandi.tech
ARG VITE_GIT_SHA=dev
ARG VITE_BUILD_TIME
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ENV VITE_BUILD_TIME=$VITE_BUILD_TIME

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build with production env (use .env.production.example as fallback)
RUN if [ -f .env.production ]; then cp .env.production .env; \
    elif [ -f .env.production.example ]; then cp .env.production.example .env; \
    fi

# ENV-001: Set build time if not provided
RUN if [ -z "$VITE_BUILD_TIME" ]; then export VITE_BUILD_TIME=$(date -Iseconds); fi && npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add health check
RUN echo "OK" > /usr/share/nginx/html/health.txt

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health.txt || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
