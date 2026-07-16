import React from "react";
import type { BaseNodeData } from "../lib/types";

export function NodeChrome({
  title,
  data,
  children
}: {
  title: string;
  data: BaseNodeData;
  children: React.ReactNode;
}) {
  const statusClass = data.status || "idle";
  return (
    <div className={`node-card ${statusClass}`}>
      <div className="node-header">
        <span>{title}</span>
        {data.status === "running" && <span>⏳</span>}
        {data.status === "done" && <span style={{ color: "var(--ok)" }}>●</span>}
        {data.status === "error" && <span style={{ color: "var(--err)" }}>●</span>}
      </div>
      <div className="node-body">{children}</div>
      {data.status === "error" && <div className="node-output">⚠ {data.error}</div>}
      {data.status === "done" && data.output !== undefined && (
        <div className="node-output">
          {data.output.startsWith("data:image") ? (
            <img src={data.output} alt="output" />
          ) : (
            data.output.slice(0, 800) || "(empty)"
          )}
        </div>
      )}
    </div>
  );
}
