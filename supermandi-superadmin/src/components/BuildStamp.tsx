// GO-LIVE-SOP: Build stamp for cache-proof deployment verification
// Shows git SHA and deploy timestamp to verify UI is updated

export function BuildStamp() {
  // These are injected at build time via vite.config.ts define
  const buildSha = import.meta.env.VITE_BUILD_SHA || 'dev';
  const buildTime = import.meta.env.VITE_BUILD_TIME || 'local';

  return (
    <div className="sa-build-stamp">
      Build: {buildSha} · Deployed: {buildTime}
    </div>
  );
}

export default BuildStamp;
