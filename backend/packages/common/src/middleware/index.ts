// Middleware Module - GO-LIVE Batch 0
// Standardized Express middleware for all services

// Request Timeout (GO-LIVE-056)
export { requestTimeout, TimeoutOptions } from './timeout';

// Error Handler (GO-LIVE-055)
export {
  errorHandler,
  notFoundHandler,
  ErrorHandlerOptions,
  StandardErrorResponse,
} from './errorHandler';
