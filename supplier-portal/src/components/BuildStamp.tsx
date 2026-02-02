// GO-LIVE-SOP: Build stamp for cache-proof deployment verification
// Shows git SHA and deploy timestamp to verify UI is updated

'use client';

export function BuildStamp() {
  // These are injected at build time via next.config.js env
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || 'local';

  return (
    <div
      style={{
        fontSize: '11px',
        color: '#94a3b8',
        fontFamily: 'monospace',
        textAlign: 'center',
        padding: '4px 0',
      }}
    >
      Build: {buildSha} · Deployed: {buildTime}
    </div>
  );
}

export default BuildStamp;
