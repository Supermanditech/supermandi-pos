# Voice Service Dockerfile - V3.0.9 compliant
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
COPY services/voice-service/package.json ./services/voice-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/common ./packages/common
COPY services/voice-service ./services/voice-service
COPY tsconfig.base.json ./

# Build common package first
WORKDIR /app/packages/common
RUN pnpm run build

# Build service
WORKDIR /app/services/voice-service
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
COPY services/voice-service/package.json ./services/voice-service/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/services/voice-service/dist ./services/voice-service/dist

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/services/voice-service

# CR-VERSION-001: Build args for version endpoint
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

# Environment
ENV NODE_ENV=production \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME
ENV VOICE_SERVICE_PORT=3008

EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3008/health || exit 1

CMD ["node", "dist/index.js"]
