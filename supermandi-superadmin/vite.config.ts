import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  // GO-LIVE-SOP: Inject build info at compile time
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildInfo.sha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildInfo.time),
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
})
