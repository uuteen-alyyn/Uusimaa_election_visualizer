/**
 * Compact chip row of the eight canonical parties — used in the
 * per-mode parameter row when the active workflow `needsParty`
 * (support / votes / change).
 *
 * `allowAll` adds a leading "Kaikki" chip that selects null. Used
 * by the votes mode so the user can color the map by total votes
 * given (regardless of party) in addition to per-party totals.
 */

import { PARTIES } from "../data/catalog";
import type { PartyId } from "../types/elections";

interface PartyPickerProps {
  value: PartyId | null;
  onChange: (next: PartyId | null) => void;
  /** When true, prepend a "Kaikki puolueet" chip whose value is `null`. */
  allowAll?: boolean;
}

export function PartyPicker({
  value,
  onChange,
  allowAll = false,
}: PartyPickerProps): JSX.Element {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {allowAll ? (
        <span
          className="chip"
          onClick={() => onChange(null)}
          role="button"
          tabIndex={0}
          aria-pressed={value === null}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(null);
            }
          }}
          style={{
            cursor: "pointer",
            background: value === null ? "var(--ink)" : "var(--paper)",
            color: value === null ? "var(--paper)" : "var(--ink)",
            borderColor: value === null ? "var(--ink)" : "var(--line)",
            fontStyle: "italic",
          }}
        >
          Kaikki
        </span>
      ) : null}
      {PARTIES.map((p) => {
        const active = value === p.id;
        return (
          <span
            key={p.id}
            className="chip"
            onClick={() => onChange(p.id)}
            role="button"
            tabIndex={0}
            aria-pressed={active}
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
