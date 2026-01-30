/**
 * GO-LIVE-183: Circuit Breaker for Database Operations
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when the database is unavailable. The breaker has three states:
 *
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail fast without hitting DB
 * - HALF_OPEN: Testing if service has recovered
 *
 * Configuration:
 * - failureThreshold: Number of failures before opening circuit
 * - resetTimeout: Time to wait before testing recovery (half-open)
 * - successThreshold: Successful requests needed in half-open to close
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;  // failures before opening
  resetTimeout: number;      // ms before trying again (half-open)
  successThreshold: number;  // successes in half-open before closing
  monitorWindow: number;     // ms window for failure counting
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  tripCount: number;
  totalRequests: number;
  failedRequests: number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  resetTimeout: 30000,     // 30 seconds
  successThreshold: 2,
  monitorWindow: 60000,    // 1 minute
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private tripCount: number = 0;
  private totalRequests: number = 0;
  private failedRequests: number = 0;
  private lastStateChange: Date = new Date();
  private failureTimestamps: number[] = [];

  constructor(private readonly config: CircuitBreakerConfig) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    this.checkResetTimeout();

    if (this.state === 'OPEN') {
      this.failedRequests++;
      throw new CircuitBreakerError(
        `Circuit breaker "${this.config.name}" is OPEN`,
        this.config.name,
        this.state
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  private onSuccess(): void {
    this.lastSuccess = new Date();
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    } else {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  /**
   * Record a failed operation
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailure = new Date(now);
    this.failures++;
    this.failedRequests++;

    // Track failure timestamp for window-based counting
    this.failureTimestamps.push(now);

    // Remove old failures outside the monitor window
    const windowStart = now - this.config.monitorWindow;
    this.failureTimestamps = this.failureTimestamps.filter(ts => ts > windowStart);

    // Check if we should trip the circuit
    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open trips back to open
      this.trip();
    } else if (this.state === 'CLOSED') {
      // Check if failures in window exceed threshold
      if (this.failureTimestamps.length >= this.config.failureThreshold) {
        this.trip();
      }
    }
  }

  /**
   * Trip the circuit to OPEN state
   */
  private trip(): void {
    const previousState = this.state;
    this.state = 'OPEN';
    this.lastStateChange = new Date();
    this.successes = 0;

    if (previousState !== 'OPEN') {
      this.tripCount++;
      console.error(
        `[GO-LIVE-183] Circuit breaker "${this.config.name}" TRIPPED (${previousState} -> OPEN). ` +
        `Failures in window: ${this.failureTimestamps.length}, Trip count: ${this.tripCount}`
      );
    }
  }

  /**
   * Check if reset timeout has passed and transition to HALF_OPEN
   */
  private checkResetTimeout(): void {
    if (this.state !== 'OPEN') return;

    const timeSinceTrip = Date.now() - this.lastStateChange.getTime();
    if (timeSinceTrip >= this.config.resetTimeout) {
      this.state = 'HALF_OPEN';
      this.lastStateChange = new Date();
      this.successes = 0;
      console.log(
        `[GO-LIVE-183] Circuit breaker "${this.config.name}" entering HALF_OPEN state. ` +
        `Testing recovery...`
      );
    }
  }

  /**
   * Close the circuit (normal operation)
   */
  private close(): void {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.lastStateChange = new Date();
    this.failures = 0;
    this.failureTimestamps = [];

    if (previousState !== 'CLOSED') {
      console.log(
        `[GO-LIVE-183] Circuit breaker "${this.config.name}" CLOSED (recovered). ` +
        `Total trip count: ${this.tripCount}`
      );
    }
  }

  /**
   * Force open the circuit (for testing or manual intervention)
   */
  forceOpen(): void {
    this.trip();
  }

  /**
   * Force close the circuit (for testing or manual intervention)
   */
  forceClose(): void {
    this.close();
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkResetTimeout();
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      tripCount: this.tripCount,
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
    };
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    this.checkResetTimeout();
    return this.state !== 'OPEN';
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerError extends Error {
  public readonly circuitName: string;
  public readonly circuitState: CircuitState;

  constructor(message: string, circuitName: string, circuitState: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.circuitName = circuitName;
    this.circuitState = circuitState;
  }
}

// =============================================================================
// SINGLETON CIRCUIT BREAKERS
// =============================================================================

// Global circuit breaker registry
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({
      name,
      ...DEFAULT_CONFIG,
      ...config,
    }));
  }
  return circuitBreakers.get(name)!;
}

/**
 * Get the database circuit breaker
 */
export function getDbCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker('database', {
    failureThreshold: 5,
    resetTimeout: 30000,  // 30 seconds
    successThreshold: 2,
    monitorWindow: 60000, // 1 minute
  });
}

/**
 * Get all circuit breaker stats for health checks
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}

/**
 * Wrapper function to execute database operations with circuit breaker
 */
export async function withDbCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  const breaker = getDbCircuitBreaker();
  return breaker.execute(fn);
}

/**
 * Check if database operations are currently allowed
 */
export function isDbAvailable(): boolean {
  return getDbCircuitBreaker().isAllowingRequests();
}
