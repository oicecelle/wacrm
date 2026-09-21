"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node as RFNode,
  type Edge as RFEdge,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Zap, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildAutomationDiagram } from "./automation-diagram";
import { STEP_META, previewFor, type BuilderStep } from "./automation-builder";

/**
 * Read-oriented visualization of the same step tree the list view
 * edits — not a free-form graph like the Flows canvas, since an
 * automation's structure (sequential steps + binary branches that
 * reconverge) doesn't need arbitrary reconnection. Clicking a step
 * jumps back to list view with that step expanded, rather than
 * duplicating the whole editing form into a second place.
 */
export function AutomationDiagramView({
  steps,
  triggerLabel,
  onEditStep,
}: {
  steps: BuilderStep[];
  triggerLabel: string;
  onEditStep: (cid: string) => void;
}) {
  const { nodes, edges } = useMemo(() => buildAutomationDiagram(steps), [steps]);

  const rfNodes: RFNode[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "step",
        position: { x: n.x, y: n.y },
        data: { node: n, triggerLabel },
        draggable: false,
        selectable: n.kind === "step",
      })),
    [nodes, triggerLabel],
  );

  const rfEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: false,
        style: { stroke: "var(--border)" },
        labelStyle: { fontSize: 10, fontWeight: 700, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--card)" },
      })),
    [edges],
  );

  const nodeTypes = useMemo(
    () => ({
      step: (props: { data: { node: (typeof nodes)[number]; triggerLabel: string } }) => (
        <StepNode {...props.data} onEditStep={onEditStep} />
      ),
    }),
    [onEditStep],
  );

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-xl border border-border bg-muted/20">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function StepNode({
  node,
  triggerLabel,
  onEditStep,
}: {
  node: { kind: "trigger" | "step" | "end"; step: BuilderStep | null };
  triggerLabel: string;
  onEditStep: (cid: string) => void;
}) {
  if (node.kind === "trigger") {
    return (
      <div className="flex w-[220px] items-center gap-2.5 rounded-lg border-l-4 border-l-blue-600 border border-border bg-card px-3.5 py-3 shadow-lg">
        <Handle type="source" position={Position.Bottom} className="!bg-border" />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Gatilho</p>
          <p className="truncate text-xs font-semibold text-foreground">{triggerLabel}</p>
        </div>
      </div>
    );
  }

  if (node.kind === "end") {
    return (
      <div className="flex w-[220px] items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5">
        <Handle type="target" position={Position.Top} className="!bg-border" />
        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground">Fim</p>
      </div>
    );
  }

  const step = node.step!;
  const meta = STEP_META[step.step_type];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onEditStep(step.cid)}
      className={cn(
        "flex w-[220px] items-center gap-2.5 rounded-lg border-l-4 border border-border bg-card px-3.5 py-3 text-left shadow-lg transition-transform hover:scale-[1.02]",
        meta.border,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {step.step_type === "condition" ? "Condição" : "Ação"}
        </p>
        <p className="truncate text-xs font-semibold text-foreground">{meta.label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{previewFor(step)}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </button>
  );
}
