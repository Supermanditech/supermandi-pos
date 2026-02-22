// GO-LIVE-SOP: Build stamp for cache-proof deployment verification
// Shows git SHA and deploy timestamp to verify UI is updated

'use client';

import { useEffect, useState } from 'react';

export function BuildStamp() {
  // These are injected at build time via next.config.js env
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || 'local';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      suppressHydrationWarning
      style={{
        fontSize: '11px',
        color: '#94a3b8',
        fontFamily: 'monospace',
        textAlign: 'center',
        padding: '4px 0',
      }}
    >
      {mounted ? `Build: ${buildSha} · Deployed: ${buildTime}` : 'Build: ... · Deployed: ...'}
    </div>
  );
}

export default BuildStamp;
