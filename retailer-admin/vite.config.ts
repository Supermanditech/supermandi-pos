import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// GO-LIVE-SOP: Get build info for cache-proof deployment verification
function getBuildInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(',', '');
    return { sha, time };
  } catch {
    return { sha: 'unknown', time: new Date().toISOString() };
  }
}

const buildInfo = getBuildInfo();

export default defineConfig({
  plugins: [react()],
  base: '/retailer/',
  // GO-LIVE-SOP: Inject build info at compile time
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildInfo.sha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildInfo.time),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://34.14.220.171:3000',
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
