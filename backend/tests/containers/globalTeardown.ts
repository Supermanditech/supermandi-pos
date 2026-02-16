// TEST-001: Testcontainers Global Teardown
// Stops the PostgreSQL container started by globalSetup.

import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '.container-state.json');

export default async function globalTeardown(): Promise<void> {
  // Clean up state file
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }

  // Container is auto-stopped by testcontainers' resource reaper (ryuk)
  // No manual stop needed — the reaper cleans up after the JVM/process exits
  console.log('\n🧹 Testcontainer cleanup complete (ryuk handles container removal)\n');
}
