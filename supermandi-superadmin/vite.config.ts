import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// GO-LIVE-SOP: Get build info for cache-proof deployment verification
// STAGING-FIX-006: Check VITE_GIT_SHA env var first (Docker builds lack .git directory)
function getBuildInfo() {
  try {
    const sha = process.env.VITE_GIT_SHA
      || process.env.VITE_BUILD_SHA
      || execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(',', '');
    return { sha, time };
  } catch {
    return { sha: process.env.VITE_GIT_SHA || 'unknown', time: new Date().toISOString() };
  }
}

const buildInfo = getBuildInfo();

// DEPLOY-389: Version endpoint plugin - writes _version.json to dist
function versionPlugin(): Plugin {
  return {
    name: 'version-plugin',
    closeBundle() {
      const versionData = {
        commit: buildInfo.sha,
        buildTime: buildInfo.time,
        portal: 'superadmin',
      };
      const distPath = join(__dirname, 'dist');
      try {
        mkdirSync(distPath, { recursive: true });
        writeFileSync(join(distPath, '_version.json'), JSON.stringify(versionData, null, 2));
        console.log('[version-plugin] Wrote _version.json:', versionData);
      } catch (err) {
        console.error('[version-plugin] Failed to write _version.json:', err);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // FIX-004: Fail build when VITE_API_BASE_URL is not explicitly set
  // Empty string is valid (load-balancer relative paths). Undefined = misconfigured build.
  if (command === 'build' && process.env.VITE_API_BASE_URL === undefined) {
    throw new Error(
      '[FIX-004] VITE_API_BASE_URL must be explicitly set for production builds. ' +
      'Set VITE_API_BASE_URL="" for load-balancer relative paths, or provide a full URL.'
    );
  }

  return {
    plugins: [react(), versionPlugin()],
    base: '/admin/',
    // GO-LIVE-SOP: Inject build info at compile time
    define: {
      'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildInfo.sha),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildInfo.time),
    },
    esbuild: {
      drop: ['console', 'debugger'],
    },
  };
})
