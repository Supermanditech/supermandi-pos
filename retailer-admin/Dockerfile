# Retailer Admin Portal - Production Dockerfile
# GO-LIVE-B9: Batch 9 UI Testing deployment

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build with production env
COPY .env.production .env
RUN npm run build

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
