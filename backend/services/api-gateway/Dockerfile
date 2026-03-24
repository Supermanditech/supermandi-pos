# API Gateway Dockerfile - V3.0.9 compliant
# Standalone Cloud Run service — routes traffic to main backend, auth, and portals
# Production-ready multi-stage build

# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.11.0 --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy service and common package files
COPY packages/common/package.json ./packages/common/
COPY services/api-gateway/package.json ./services/api-gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/common ./packages/common
COPY services/api-gateway ./services/api-gateway
COPY tsconfig.base.json ./

# Build common package first
WORKDIR /app/packages/common
RUN pnpm run build

# Build service
WORKDIR /app/services/api-gateway
RUN pnpm run build

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm for production
RUN corepack enable && corepack prepare pnpm@8.11.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy package files for production install
COPY packages/common/package.json ./packages/common/
COPY services/api-gateway/package.json ./services/api-gateway/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/services/api-gateway

# CR-VERSION-001: Build args for version endpoint
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

# Environment
ENV NODE_ENV=production \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
