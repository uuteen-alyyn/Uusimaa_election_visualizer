/**
 * Workflow pill bar — port of `prototype/wf-workflows.jsx`'s
 * WorkflowBar.
 *
 * Two rows: built-ins on top, custom workflows below. The "+ Custom"
 * trigger opens the WorkflowBuilder modal (handled by the parent).
 * Each custom pill shows a `ƒ` glyph; the row has Edit / Remove
 * popovers for managing the saved set.
 */

import { useEffect, useRef, useState } from "react";

import { workflowsEquivalent, workflowSubtitle } from "../lib/workflow";
import type { Workflow } from "../types/elections";

interface WorkflowBarProps {
  builtins: readonly Workflow[];
  customs: readonly Workflow[];
  activeWorkflow: Workflow | null;
  onApply: (w: Workflow) => void;
  onOpenBuilder: () => void;
  onEdit: (w: Workflow) => void;
  onDelete: (id: string) => void;
}

export function WorkflowBar({
  builtins,
  customs,
  activeWorkflow,
  onApply,
  onOpenBuilder,
  onEdit,
  onDelete,
}: WorkflowBarProps): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Row 1: built-ins + "+ Custom" trigger */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {builtins.map((w) => (
          <Pill
            key={w.id}
            workflow={w}
            isActive={workflowsEquivalent(w, activeWorkflow)}
            onApply={onApply}
            custom={false}
          />
        ))}
        <span
          onMouseDown={(e) => {
            e.stopPropagation();
            onOpenBuilder();
          }}
          className="pill"
          style={{
            cursor: "pointer",
            fontSize: 12,
            borderStyle: "dashed",
            background: "transparent",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenBuilder();
            }
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>＋</span>
          Mukautettu
        </span>
      </div>

      {/* Row 2: customs + Edit / Remove popovers */}
      {customs.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {customs.map((w) => (
            <Pill
              key={w.id}
              workflow={w}
              isActive={workflowsEquivalent(w, activeWorkflow)}
              onApply={onApply}
              custom={true}
            />
          ))}

          <EditPopover customs={customs} onEdit={onEdit} />
          <RemovePopover customs={customs} onDelete={onDelete} />
        </div>
      ) : null}
    </div>
  );
}

/* ─── Pill ──────────────────────────────────────────────────── */

function Pill({
  workflow,
  isActive,
  onApply,
  custom,
}: {
  workflow: Workflow;
  isActive: boolean;
  onApply: (w: Workflow) => void;
  custom: boolean;
}): JSX.Element {
  return (
    <span
      className={"pill" + (isActive ? " on" : "")}
      title={workflowSubtitle(workflow)}
      onClick={() => onApply(workflow)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onApply(workflow);
        }
      }}
      style={{
        cursor: "pointer",
        fontSize: 12,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...(custom
          ? {
              borderStyle: isActive ? "solid" : "dashed",
              background: isActive ? undefined : "#f6efdc",
            }
          : {}),
      }}
    >
      {custom ? (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            fontStyle: "italic",
            opacity: isActive ? 0.8 : 0.55,
            lineHeight: 1,
            marginRight: -2,
          }}
          aria-hidden="true"
        >
          ƒ
        </span>
      ) : null}
      {workflow.label}
    </span>
  );
}

/* ─── Edit popover ──────────────────────────────────────────── */

function EditPopover({
  customs,
  onEdit,
}: {
  customs: readonly Workflow[];
  onEdit: (w: Workflow) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <span
        onClick={() => setOpen((o) => !o)}
        className="pill"
        style={{
          cursor: "pointer",
          fontSize: 12,
          opacity: 0.85,
          borderStyle: "dotted",
          background: "transparent",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
        }}
        role="button"
        tabIndex={0}
      >
        <span style={{ fontSize: 12, lineHeight: 1 }}>✎</span>
        Muokkaa…
      </span>
      {open ? (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            minWidth: 240,
            padding: 10,
            background: "var(--paper)",
            border: "var(--border-default) solid var(--line)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              opacity: 0.65,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Valitse muokattava
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {customs.map((w) => (
              <span
                key={w.id}
                onClick={() => {
                  onEdit(w);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                  borderRadius: "var(--radius-chip)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.5 }}>
                  ƒ
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w.label}
                </span>
                <span style={{ fontSize: 11, opacity: 0.5 }}>✎</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
}

/* ─── Remove popover ────────────────────────────────────────── */

function RemovePopover({
  customs,
  onDelete,
}: {
  customs: readonly Workflow[];
  onDelete: (id: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <span
        onClick={() => {
          setOpen((o) => !o);
          setSel(new Set());
        }}
        className="pill"
        style={{
          cursor: "pointer",
          fontSize: 12,
          opacity: 0.75,
          borderStyle: "dotted",
          background: "transparent",
          whiteSpace: "nowrap",
        }}
        role="button"
        tabIndex={0}
      >
        Poista…
      </span>
      {open ? (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            minWidth: 240,
            padding: 10,
            background: "var(--paper)",
            border: "var(--border-default) solid var(--line)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              opacity: 0.65,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Valitse poistettavat
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {customs.map((w) => (
              <label
                key={w.id}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={sel.has(w.id)}
                  onChange={(e) => {
                    setSel((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(w.id);
                      else next.delete(w.id);
                      return next;
                    });
                  }}
                />
                <span>{w.label}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
            <span
              className="btn"
              onClick={() => setOpen(false)}
              style={{ cursor: "pointer", fontSize: 11, padding: "4px 9px" }}
            >
              Peruuta
            </span>
            <span
              className="btn"
              onClick={() => {
                sel.forEach((id) => onDelete(id));
                setOpen(false);
                setSel(new Set());
              }}
              style={{
                cursor: sel.size > 0 ? "pointer" : "not-allowed",
                opacity: sel.size > 0 ? 1 : 0.4,
                fontSize: 11,
                padding: "4px 9px",
                background: "var(--ink)",
                color: "var(--paper)",
              }}
            >
              Poista {sel.size > 0 ? sel.size : ""}
            </span>
          </div>
        </div>
      ) : null}
    </span>
  );
}
