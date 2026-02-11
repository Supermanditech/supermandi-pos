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
# STAGING-FIREBASE-001: Firebase config for phone OTP authentication
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_GIT_SHA=${NEXT_PUBLIC_GIT_SHA}
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}

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

# Copy public directory if it exists (optional)
RUN mkdir -p ./public

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# SUP-ROOT-001: Health check must use /supplier/ path (basePath in next.config.js)
# SUP-PORT-001: PORT env var (line 60) controls the listen port
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/supplier/ || exit 1

# Start Next.js production server
CMD ["npm", "start"]
