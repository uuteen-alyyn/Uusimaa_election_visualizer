/**
 * Compact chip row of the eight canonical parties — used in the
 * per-mode parameter row when the active workflow `needsParty`
 * (support / votes / change).
 */

import { PARTIES } from "../data/catalog";
import type { PartyId } from "../types/elections";

interface PartyPickerProps {
  value: PartyId | null;
  onChange: (next: PartyId) => void;
}

export function PartyPicker({ value, onChange }: PartyPickerProps): JSX.Element {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {PARTIES.map((p) => {
        const active = value === p.id;
        return (
          <span
            key={p.id}
            className="chip"
            onClick={() => onChange(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(p.id);
              }
            }}
            style={{
              cursor: "pointer",
              background: active ? `var(--p-${p.id})` : "var(--paper)",
              color: active ? "#fff" : "var(--ink)",
              borderColor: active ? `var(--p-${p.id})` : "var(--line)",
            }}
          >
            <span
              className="swatch"
              style={{ background: `var(--p-${p.id})` }}
              aria-hidden="true"
            />
            {p.abbr}
          </span>
        );
      })}
    </div>
  );
}
