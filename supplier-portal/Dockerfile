# Supplier Portal Dockerfile - Next.js Production Build
# GL-UI-001: Deploy Supplier Portal UI on VM

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

# Next.js SWC requires glibc compat on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
# Using npm install instead of npm ci since package-lock.json is gitignored
RUN npm install

# Copy source code
COPY . .

# Build the Next.js application
# Note: NEXT_PUBLIC_* must be set at build time for client-side usage
# FRONTEND-CR-201: No hardcoded domain — set at build time via --build-arg
ARG NEXT_PUBLIC_API_BASE_URL=""
ARG NEXT_PUBLIC_GIT_SHA="unknown"
# STAGING-FIX-007: Firebase config comes from .env.production file (NOT Docker ARGs)
# Empty ARG strings would override file values, so Firebase is loaded from .env.production
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_GIT_SHA=${NEXT_PUBLIC_GIT_SHA}

# STAGING-AUTH-001: Load Firebase config from .env.production for Next.js build
# Next.js reads NEXT_PUBLIC_* from .env.production at build time (NODE_ENV=production)
RUN if [ -f .env.production ]; then echo "Using .env.production"; \
    elif [ -f .env.production.example ]; then cp .env.production.example .env.production && echo "Using .env.production.example as .env.production"; \
    fi

RUN npm run build

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./

# Copy public directory from builder (contains brand logos, favicon)
COPY --from=builder /app/public ./public

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# SUP-ROOT-001: Health check uses /supplier/ path (basePath + trailingSlash in next.config.js)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/supplier/ || exit 1

# Start Next.js production server
CMD ["npm", "start"]
