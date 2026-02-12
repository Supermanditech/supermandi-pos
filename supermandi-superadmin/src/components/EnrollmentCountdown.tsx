// SA-001: Extracted from App.tsx — enrollment countdown timer
// ISSUE-MICRO-086: Extracted countdown to prevent QR code re-rendering every 1s
import { useEffect, useState } from "react";

export function EnrollmentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return <>unknown</>;
  const delta = expiresAtMs - now;
  if (delta <= 0) return <>expired</>;
  const totalSeconds = Math.floor(delta / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return <>{minutes}m {String(seconds).padStart(2, "0")}s</>;
}
