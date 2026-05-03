/**
 * Native `<select>` for picking an election, grouped by election
 * type. Skips elections that have `status: "no_data"` fixtures —
 * those would render an all-cream map with "Ei tietoja" everywhere
 * and confuse first-time users.
 *
 * Phase 4 will replace this with a sketchy popover-style picker
 * matching the prototype's design more closely; for now a styled
 * native select keeps things keyboard-accessible and small.
 */

import {
  ELECTION_TYPES,
  ELECTIONS,
  type ElectionDef,
} from "../data/catalog";
import type { ElectionId } from "../types/elections";

interface ElectionPickerProps {
  value: ElectionId;
  onChange: (next: ElectionId) => void;
  /** Hide elections from this set (e.g. the current election when
   *  picking a reference election so they're not equal). */
  exclude?: ReadonlySet<ElectionId>;
  /** Set of election ids that have data:
   *
   *  - `null` (still probing) → render every catalog election
   *  - `Set` → render only the ones in the set
   *
   *  Hiding (rather than disabling) keeps the picker focused on
   *  what the user can actually use. */
  hasData?: ReadonlySet<ElectionId> | null;
  ariaLabel?: string;
}

function groupElectionsByType(
  exclude: ReadonlySet<ElectionId>,
  hasData: ReadonlySet<ElectionId> | null | undefined,
): Array<{ type: string; label: string; entries: ElectionDef[] }> {
  return ELECTION_TYPES.map((t) => ({
    type: t.id,
    label: t.label,
    entries: ELECTIONS.filter(
      (e) =>
        e.typeId === t.id &&
        !exclude.has(e.id) &&
        (hasData == null || hasData.has(e.id)),
    ),
  })).filter((g) => g.entries.length > 0);
}

export function ElectionPicker({
  value,
  onChange,
  exclude,
  hasData,
  ariaLabel,
}: ElectionPickerProps): JSX.Element {
  const groups = groupElectionsByType(exclude ?? new Set(), hasData);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ElectionId)}
      aria-label={ariaLabel ?? "Vaali"}
      style={{
        border: "var(--border-default) solid var(--line)",
        background: "var(--paper)",
        padding: "5px 10px",
        borderRadius: "var(--radius-box)",
        fontFamily: "inherit",
        fontSize: 13,
        cursor: "pointer",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {groups.map((g) => (
        <optgroup key={g.type} label={g.label}>
          {g.entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.shortLabel}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
