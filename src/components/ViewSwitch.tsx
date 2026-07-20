import React from "react";

// Sliding switch between Agent (chat) and Workflow (canvas) view.
// Position is identical in both modes so it never jumps.
type Mode = "agent" | "workflow";

export function ViewSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const isWorkflow = mode === "workflow";
  return (
    <div
      className={`view-switch ${isWorkflow ? "is-workflow" : "is-agent"}`}
      role="tablist"
      aria-label="View mode"
    >
      <div className="view-switch-thumb" aria-hidden="true" />
      <button
        type="button"
        role="tab"
        aria-selected={!isWorkflow}
        className={`view-switch-btn ${!isWorkflow ? "active" : ""}`}
        onClick={() => onChange("agent")}
        title="Agent view"
      >
        <i className="chat-mark" />
        <span>Agent</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isWorkflow}
        className={`view-switch-btn ${isWorkflow ? "active" : ""}`}
        onClick={() => onChange("workflow")}
        title="Workflow view"
      >
        <i className="workflow-mark" />
        <span>Workflow</span>
      </button>
    </div>
  );
}
