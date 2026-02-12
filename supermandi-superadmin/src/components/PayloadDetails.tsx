// SA-001: Extracted from App.tsx — collapsible JSON payload viewer
import { useState, useMemo } from "react";

export function PayloadDetails({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);

  const text = useMemo(() => {
    if (!open) return "";
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [open, payload]);

  return (
    <details
      onToggle={(e) => {
        const el = e.currentTarget;
        setOpen(el.open);
      }}
    >
      <summary className="summary">View JSON</summary>
      {open && <pre className="json">{text}</pre>}
    </details>
  );
}
