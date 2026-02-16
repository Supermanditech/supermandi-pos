// TEST-001/002: Testcontainers Global Teardown
// Cleans up state files for PostgreSQL and Redis containers.

import * as fs from 'fs';
import * as path from 'path';

const PG_STATE_FILE = path.join(__dirname, '.container-state.json');
const REDIS_STATE_FILE = path.join(__dirname, '.redis-state.json');

export default async function globalTeardown(): Promise<void> {
  // Clean up state files
  for (const file of [PG_STATE_FILE, REDIS_STATE_FILE]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // Containers are auto-stopped by testcontainers' resource reaper (ryuk)
  console.log('\n🧹 Testcontainer cleanup complete (ryuk handles container removal)\n');
}
