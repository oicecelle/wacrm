import type { BuilderStep } from "./automation-builder";
import { autoLayout, type LayoutEdge, type LayoutNode } from "@/lib/flows/layout";

export interface DiagramNode {
  id: string;
  step: BuilderStep | null; // null for the synthetic trigger/end nodes
  kind: "trigger" | "step" | "end";
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;

/**
 * Converts the automation's step tree into a flat node/edge graph for
 * the diagram view. Reuses the exact same dagre-based autoLayout the
 * Flows canvas already depends on — this graph has no persisted
 * positions of its own (automations aren't draggable canvases, just
 * a read-oriented visualization of the same tree the list view
 * edits), so every render lays out fresh.
 *
 * A condition step's two branches reconverge: whatever step follows
 * the condition at its own level runs regardless of which branch was
 * taken (engine.ts's executeStepsFrom continues the parent loop after
 * recursing into a branch) — so both "Sim" and "Não" edges lead into
 * their branch's own steps, and each branch's last step gets an edge
 * back to whatever comes next after the condition (or the terminal
 * "Fim" node if the condition was the last step at that level).
 */
export function buildAutomationDiagram(steps: BuilderStep[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const layoutNodes: LayoutNode[] = [{ id: "__trigger__", width: NODE_WIDTH, height: NODE_HEIGHT }];
  const layoutEdges: LayoutEdge[] = [];
  const edgeMeta: Record<string, string | undefined> = {};
  const stepById = new Map<string, BuilderStep>();

  function walk(list: BuilderStep[], entryId: string, exitTargetId: string) {
    let prevId = entryId;
    for (let i = 0; i < list.length; i++) {
      const step = list[i];
      stepById.set(step.cid, step);
      layoutNodes.push({ id: step.cid, width: NODE_WIDTH, height: NODE_HEIGHT });
      layoutEdges.push({ source: prevId, target: step.cid });

      if (step.step_type === "condition" && step.branches) {
        const afterId = i === list.length - 1 ? exitTargetId : list[i + 1].cid;

        if (step.branches.yes.length > 0) {
          edgeMeta[`${step.cid}->${step.branches.yes[0].cid}`] = "Sim";
          walk(step.branches.yes, step.cid, afterId);
        } else {
          layoutEdges.push({ source: step.cid, target: afterId });
          edgeMeta[`${step.cid}->${afterId}`] = "Sim";
        }
        if (step.branches.no.length > 0) {
          edgeMeta[`${step.cid}->${step.branches.no[0].cid}`] = "Não";
          walk(step.branches.no, step.cid, afterId);
        } else {
          layoutEdges.push({ source: step.cid, target: afterId });
          edgeMeta[`${step.cid}->${afterId}`] = "Não";
        }
        // The condition's own "next in sequence" edge is fully
        // handled by its branches converging on `afterId` above —
        // skip the generic prevId advance below for this node.
        prevId = "__handled_by_branches__";
        continue;
      }

      prevId = step.cid;
    }
    if (prevId !== "__handled_by_branches__" && prevId !== entryId) {
      layoutEdges.push({ source: prevId, target: exitTargetId });
    } else if (list.length === 0) {
      layoutEdges.push({ source: entryId, target: exitTargetId });
    }
  }

  layoutNodes.push({ id: "__end__", width: NODE_WIDTH, height: NODE_HEIGHT });
  walk(steps, "__trigger__", "__end__");

  const positions = autoLayout(layoutNodes, layoutEdges, { direction: "TB" });

  const nodes: DiagramNode[] = layoutNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    if (n.id === "__trigger__") return { id: n.id, step: null, kind: "trigger", ...pos };
    if (n.id === "__end__") return { id: n.id, step: null, kind: "end", ...pos };
    return { id: n.id, step: stepById.get(n.id) ?? null, kind: "step", ...pos };
  });

  const edges: DiagramEdge[] = layoutEdges.map((e, i) => ({
    id: `e${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: edgeMeta[`${e.source}->${e.target}`],
  }));

  return { nodes, edges };
}
