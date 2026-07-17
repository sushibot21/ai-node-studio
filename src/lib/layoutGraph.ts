import type { Edge, Node } from "@xyflow/react";
import type { AnyNodeData } from "./types";

// Deterministic layered layout for generated graphs. Nodes are placed in columns
// by their longest-path depth from a source (so data flows left→right), and
// stacked vertically within each column and centred — which prevents the
// scattered / overlapping placement that ad-hoc positioning produced.
export function layoutGraph(
  nodes: Node<AnyNodeData>[],
  edges: Edge[],
  opts: { colGap?: number; rowGap?: number; x0?: number; y0?: number } = {}
): Node<AnyNodeData>[] {
  const { colGap = 340, rowGap = 190, x0 = 60, y0 = 80 } = opts;
  const ids = new Set(nodes.map((n) => n.id));
  const preds = new Map(nodes.map((n) => [n.id, [] as string[]]));
  edges.forEach((e) => {
    if (ids.has(e.source) && ids.has(e.target)) preds.get(e.target)!.push(e.source);
  });

  // Longest-path depth (memoised; cycle-safe via a visiting guard).
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const calc = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const ps = preds.get(id) || [];
    const d = ps.length ? Math.max(...ps.map(calc)) + 1 : 0;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => calc(n.id));

  // Group by column (preserving original order for stable stacking).
  const cols = new Map<number, Node<AnyNodeData>[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) || 0;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n);
  });
  const maxRows = Math.max(1, ...[...cols.values()].map((c) => c.length));

  return nodes.map((n) => {
    const d = depth.get(n.id) || 0;
    const col = cols.get(d)!;
    const row = col.indexOf(n);
    const offset = (maxRows - col.length) / 2; // vertically centre shorter columns
    return { ...n, position: { x: x0 + d * colGap, y: y0 + (row + offset) * rowGap } };
  });
}
