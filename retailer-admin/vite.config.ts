import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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

// GO-LIVE: Version endpoint plugin - writes _version.json to dist
function versionPlugin(): Plugin {
  return {
    name: 'version-plugin',
    closeBundle() {
      const versionData = {
        commit: buildInfo.sha,
        buildTime: buildInfo.time,
        portal: 'retailer',
      };
      const distPath = join(__dirname, 'dist');
      try {
        mkdirSync(distPath, { recursive: true });
        writeFileSync(join(distPath, 'version.json'), JSON.stringify(versionData, null, 2));
        console.log('[version-plugin] Wrote _version.json:', versionData);
      } catch (err) {
        console.error('[version-plugin] Failed to write _version.json:', err);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), versionPlugin()],
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
        target: 'http://localhost:3000',
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
