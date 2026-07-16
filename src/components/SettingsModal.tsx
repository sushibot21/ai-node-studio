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
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Recommended setup</h4>
          <p style={{ color: "var(--text-dim)", fontSize: 13, margin: "0 0 10px" }}>
            Start with Ollama for local workflows. Turn on Anthropic later if you want a hosted model for
            stronger writing quality or MCP-driven flows around tools like Figma.
          </p>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
            <strong>Local default</strong>: install Ollama, run it locally, and keep using the built-in
            Ollama provider.
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
            <strong>Optional upgrade</strong>: add <code>ANTHROPIC_API_KEY</code> in <code>.env</code> if
            you want to use Anthropic nodes or future MCP-assisted authoring flows.
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Current Figma support depends on the available MCP tools. An Anthropic key does not itself enable
            Figma write access, but it gives you a stronger hosted model option when building those workflows.
          </div>
        </div>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
