/**
 * STG-418: Verify startStockMonitor() is called in reorder-service entrypoint
 * and health endpoint reports cron status.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-418: Reorder service stock monitor startup', () => {
  const indexSource = readFileSync(
    join(__dirname, '..', 'services', 'reorder-service', 'src', 'index.ts'),
    'utf-8'
  );

  it('should import startStockMonitor from stockMonitor', () => {
    expect(indexSource).toContain("import { startStockMonitor");
    expect(indexSource).toContain("from './jobs/stockMonitor'");
  });

  it('should call startStockMonitor() in listen callback', () => {
    // Verify it's called inside app.listen
    const listenBlock = indexSource.substring(indexSource.indexOf('app.listen'));
    expect(listenBlock).toContain('startStockMonitor()');
  });

  it('should import isStockMonitorRunning for health check', () => {
    expect(indexSource).toContain('isStockMonitorRunning');
  });

  it('should include stockMonitor status in /health endpoint', () => {
    expect(indexSource).toContain("stockMonitor: cronRunning ? 'running' : 'stopped'");
  });

  it('should call stopStockMonitor on SIGTERM', () => {
    const sigtermBlock = indexSource.substring(
      indexSource.indexOf("'SIGTERM'"),
      indexSource.indexOf("'SIGINT'")
    );
    expect(sigtermBlock).toContain('stopStockMonitor()');
  });

  it('should call stopStockMonitor on SIGINT', () => {
    const sigintIdx = indexSource.indexOf("'SIGINT'");
    const sigintBlock = indexSource.substring(sigintIdx);
    expect(sigintBlock).toContain('stopStockMonitor()');
  });
});
