import React, { useEffect, useState } from "react";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({}));
  }, []);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Provider status</h3>
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
          Add API keys in <code>.env</code> at the project root, then restart the server.
        </p>
        {status &&
          Object.entries(status).map(([provider, ok]) => (
            <div key={provider} style={{ marginBottom: 6 }}>
              <span className="status-dot" style={{ background: ok ? "var(--ok)" : "var(--err)" }} />
              {provider} {ok ? "— configured" : "— missing key"}
            </div>
          ))}
        <button className="btn primary" style={{ marginTop: 12 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
