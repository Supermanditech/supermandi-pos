# SuperMandi Backend

Microservices backend for SuperMandi POS system.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start PostgreSQL + Redis
pnpm docker:up

# Run migrations
pnpm migrate:up

# Start all services in dev mode
pnpm dev
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| api-gateway | 3000 | Routing, CORS, Rate-limit |
| auth-service | 3001 | Authentication, RBAC |
| platform-service | 3008 | Stores, Feature flags |
| supplier-service | 3002 | Supplier management |
| catalog-service | 3003 | Product catalog |
| inventory-service | 3004 | Stock management |
| order-service | 3005 | Purchase orders |
| reorder-service | 3006 | Auto-reorder |

## Structure

```
backend/
├── services/          # Microservices
├── packages/common/   # Shared code
├── migrations/        # Database migrations
└── tests/             # Integration tests
```

## Commands

- `pnpm dev` - Start all services in dev mode
- `pnpm build` - Build all services
- `pnpm test` - Run all tests
- `pnpm lint` - Run ESLint
- `pnpm docker:up` - Start PostgreSQL + Redis
- `pnpm docker:down` - Stop containers
