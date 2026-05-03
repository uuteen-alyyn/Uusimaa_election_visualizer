/**
 * Workflow pill bar — port of `prototype/wf-workflows.jsx`'s
 * WorkflowBar (Phase 3 (2/4) ships built-ins only; the custom row
 * + Edit/Remove popovers + "+ Custom" trigger come in Phase 3 (4/4)).
 */

import { workflowsEquivalent, workflowSubtitle } from "../lib/workflow";
import type { Workflow } from "../types/elections";

interface WorkflowBarProps {
  workflows: readonly Workflow[];
  /** The currently-applied workflow shape — the bar highlights any
   *  pill `workflowsEquivalent` to this. */
  activeWorkflow: Workflow | null;
  onApply: (w: Workflow) => void;
}

export function WorkflowBar({
  workflows,
  activeWorkflow,
  onApply,
}: WorkflowBarProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {workflows.map((w) => {
        const isActive = workflowsEquivalent(w, activeWorkflow);
        return (
          <span
            key={w.id}
            className={"pill" + (isActive ? " on" : "")}
            title={workflowSubtitle(w)}
            onClick={() => onApply(w)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onApply(w);
              }
            }}
            style={{ cursor: "pointer", fontSize: 12 }}
          >
            {w.label}
          </span>
        );
      })}
    </div>
  );
}
