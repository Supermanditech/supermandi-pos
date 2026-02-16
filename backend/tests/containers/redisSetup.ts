// TEST-002: Redis Testcontainer Setup
// Starts a real Redis 7 container for integration testing of:
// - Cache operations (get/set/delete/pattern)
// - Rate limiting (sliding window)
// - Token blacklist
// - BullMQ queue/worker event processing

import * as fs from 'fs';
import * as path from 'path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

const REDIS_STATE_FILE = path.join(__dirname, '.redis-state.json');

export interface RedisContainerState {
  host: string;
  port: number;
}

/**
 * Start a Redis 7 container for integration tests.
 * Called from globalSetup (alongside PostgreSQL container).
 */
export async function startRedisContainer(): Promise<RedisContainerState> {
  const startTime = Date.now();
  console.log('  🔴 Starting Redis testcontainer...');

  const container: StartedTestContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--save', '', '--appendonly', 'no']) // No persistence for tests
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  const state: RedisContainerState = {
    host: container.getHost(),
    port: container.getMappedPort(6379),
  };

  fs.writeFileSync(REDIS_STATE_FILE, JSON.stringify(state, null, 2));

  // Set env vars for test workers
  process.env.REDIS_HOST = state.host;
  process.env.REDIS_PORT = String(state.port);
  process.env.REDIS_ENABLED = 'true';

  const elapsed = Date.now() - startTime;
  console.log(`  Redis ready at ${state.host}:${state.port} in ${elapsed}ms`);

  return state;
}

/**
 * Read Redis container state from file (for test workers).
 */
export function getRedisState(): RedisContainerState | null {
  if (!fs.existsSync(REDIS_STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(REDIS_STATE_FILE, 'utf-8'));
}

/**
 * Clean up Redis state file (called from globalTeardown).
 */
export function cleanupRedisState(): void {
  if (fs.existsSync(REDIS_STATE_FILE)) {
    fs.unlinkSync(REDIS_STATE_FILE);
  }
}
