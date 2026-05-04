/**
 * Mittari (metric / workflow) picker.
 *
 * Replaces the prototype's row of workflow pills with a single
 * native `<select>` styled like ElectionPicker. The four built-ins
 * sit in a "Perus" optgroup; saved custom formulas in "Mukautetut";
 * a final "+ Uusi mukautettu kaava…" entry opens the builder.
 *
 * When a custom workflow is the active one, edit + delete buttons
 * surface inline so the user can manage it without trips through a
 * separate menu.
 */

import { workflowsEquivalent } from "../lib/workflow";
import type { Workflow } from "../types/elections";

interface MittariDropdownProps {
  builtins: ReadonlyArray<Workflow>;
  customs: ReadonlyArray<Workflow>;
  activeWorkflow: Workflow;
  onApply: (w: Workflow) => void;
  onOpenBuilder: () => void;
  onEdit: (w: Workflow) => void;
  onDelete: (id: string) => void;
}

const NEW_VALUE = "__new";

export function MittariDropdown({
  builtins,
  customs,
  activeWorkflow,
  onApply,
  onOpenBuilder,
  onEdit,
  onDelete,
}: MittariDropdownProps): JSX.Element {
  // Match the active workflow against builtins / customs by
  // equivalence so the dropdown highlights the right entry even
  // when the user has tweaked sub-controls (party, ref election)
  // off the canonical built-in defaults.
  const activeId =
    customs.find((w) => workflowsEquivalent(w, activeWorkflow))?.id ??
    builtins.find((w) => workflowsEquivalent(w, activeWorkflow))?.id ??
    "";

  const activeCustom = customs.find((w) => w.id === activeId) ?? null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const v = e.target.value;
    if (v === NEW_VALUE) {
      onOpenBuilder();
      return;
    }
    const w =
      builtins.find((x) => x.id === v) ?? customs.find((x) => x.id === v);
    if (w) onApply(w);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <select
        value={activeId}
        onChange={handleChange}
        aria-label="Mittari"
        style={{
          border: "var(--border-default) solid var(--line)",
          background: "var(--paper)",
          padding: "5px 10px",
          borderRadius: "var(--radius-box)",
          fontFamily: "inherit",
          fontSize: 13,
          cursor: "pointer",
          boxShadow: "var(--shadow-soft)",
          minWidth: 180,
        }}
      >
        <optgroup label="Perus">
          {builtins.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </optgroup>
        {customs.length > 0 ? (
          <optgroup label="Mukautetut">
            {customs.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value={NEW_VALUE}>+ Uusi mukautettu kaava…</option>
      </select>
      {activeCustom ? (
        <>
          <button
            type="button"
            onClick={() => onEdit(activeCustom)}
            aria-label="Muokkaa kaavaa"
            title="Muokkaa kaavaa"
            style={iconButtonStyle}
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => onDelete(activeCustom.id)}
            aria-label="Poista kaava"
            title="Poista kaava"
            style={iconButtonStyle}
          >
            ✕
          </button>
        </>
      ) : null}
    </span>
  );
}

const iconButtonStyle: React.CSSProperties = {
  border: "var(--border-thin) solid var(--line)",
  background: "var(--paper)",
  cursor: "pointer",
  fontSize: 13,
  padding: "2px 7px",
  borderRadius: "var(--radius-chip)",
  fontFamily: "inherit",
  color: "var(--ink)",
};
