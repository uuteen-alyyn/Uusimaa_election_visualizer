/**
 * Formula composer — chip-based input with progressive
 * type → year → who slot filling and a keyboard-navigable
 * suggestion list.
 *
 * Ported from `prototype/wf-suggest.jsx`'s `FormulaComposer`.
 * Pure helpers (scoring, slot logic, suggestion building) live in
 * `src/lib/composer-suggestions.ts` and have their own tests.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildSuggestions,
  chipFullText,
  chipIsComplete,
  chipText,
  nextFieldFor,
  stripLastField,
  type SelectorRecord,
  type Suggestion,
  type WhoMode,
} from "../lib/composer-suggestions";
import { chipElectionId } from "../lib/formula";
import type {
  Candidate,
  ChipFields,
  ElectionId,
  FormulaToken,
} from "../types/elections";

interface FormulaComposerProps {
  tokens: FormulaToken[];
  setTokens: (next: FormulaToken[] | ((prev: FormulaToken[]) => FormulaToken[])) => void;
  selectors: SelectorRecord[];
  setSelectors: (next: SelectorRecord[] | ((prev: SelectorRecord[]) => SelectorRecord[])) => void;
  /** Async lookup for candidates of a given election. Composer
   *  triggers the fetch when the active chip's election resolves
   *  and the user is on the "who" slot. */
  loadCandidatesForElection?: (electionId: ElectionId) => Promise<Candidate[]>;
  /** Election ids that have data — used to filter the year picker
   *  so the user can't pick a no-data election. `null` while
   *  probing means "show everything". */
  availableElectionIds?: ReadonlySet<ElectionId> | null;
}

export function FormulaComposer({
  tokens,
  setTokens,
  selectors,
  setSelectors,
  loadCandidatesForElection,
  availableElectionIds = null,
}: FormulaComposerProps): JSX.Element {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [whoMode, setWhoMode] = useState<WhoMode>("party");
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Insertion-cursor position, 0…tokens.length. New tokens are
   *  inserted at this index; the input renders at this slot in the
   *  chip row. Clicking a chip moves the cursor in front of it,
   *  ArrowLeft / ArrowRight nudge by 1 (only when the input is
   *  empty so normal text-cursor behaviour isn't stolen). */
  const [cursor, setCursor] = useState(tokens.length);

  // Keep cursor pinned to the end whenever it would fall off the
  // right edge after an external token edit (e.g. parent state
  // resets `tokens` to []), so the user lands somewhere sensible.
  useEffect(() => {
    if (cursor > tokens.length) setCursor(tokens.length);
  }, [tokens.length, cursor]);

  /** Active chip = the chip immediately before the cursor that's
   *  still being filled. Lets the suggestion list and slot label
   *  follow the cursor, not just the trailing chip. */
  const tokenBeforeCursor = cursor > 0 ? tokens[cursor - 1] : undefined;
  const activeChip =
    tokenBeforeCursor && tokenBeforeCursor.kind === "chip" && !chipIsComplete(tokenBeforeCursor)
      ? tokenBeforeCursor
      : null;
  const activeField = activeChip ? nextFieldFor(activeChip) : "type";

  // Reset highlighted index whenever the query, slot, or who-mode changes.
  useEffect(() => {
    setIdx(0);
  }, [value, activeField, whoMode]);

  // When the active chip changes (new chip starts, or the user
  // backspaces out of the who slot), default the who-mode back to
  // "party" — that's the more common pick.
  useEffect(() => {
    if (activeField !== "who") setWhoMode("party");
  }, [activeField, activeChip]);

  // Resolve the active chip's election (when type+year are both
  // bound to concrete values) so we can offer candidate suggestions
  // for the right race.
  const activeElectionId = useMemo<ElectionId | null>(() => {
    if (!activeChip || activeChip.kind !== "chip") return null;
    if (activeField !== "who") return null;
    return chipElectionId(activeChip.fields);
  }, [activeChip, activeField]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  useEffect(() => {
    if (!activeElectionId || !loadCandidatesForElection) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    void loadCandidatesForElection(activeElectionId).then((c) => {
      if (!cancelled) setCandidates(c);
    });
    return () => {
      cancelled = true;
    };
  }, [activeElectionId, loadCandidatesForElection]);

  const suggestions = useMemo(() => {
    // Candidate sub-mode caps higher (12 names instead of 8 generic
    // results) so the user has plenty to scroll. Other slots stay
    // at the original 8-result cap.
    const cap =
      activeField === "who" && whoMode === "candidate" ? 16 : 8;
    return buildSuggestions(
      value,
      activeField,
      activeChip,
      selectors,
      candidates,
      cap,
      availableElectionIds,
      whoMode,
    );
  }, [
    value,
    activeField,
    activeChip,
    selectors,
    candidates,
    availableElectionIds,
    whoMode,
  ]);

  const focusInput = (): void => {
    inputRef.current?.focus();
  };

  const applyToActiveChip = (
    field: "type" | "selType" | "year" | "selYear" | "who" | "selWho",
    val: unknown,
  ): void => {
    let cursorAdvance = 0;
    setTokens((arr) => {
      const next = arr.slice();
      const target =
        activeChip ?? ({ kind: "chip", fields: {} as ChipFields } as FormulaToken);
      const chip: FormulaToken & { kind: "chip" } = {
        kind: "chip",
        fields: { ...(target.kind === "chip" ? target.fields : {}) },
      };
      if (field === "type") chip.fields.type = val as ChipFields["type"];
      else if (field === "selType") chip.fields.selType = val as string;
      else if (field === "year") {
        const v = val as { year: number; round?: 1 | 2 };
        chip.fields.year = v.year;
        if (v.round) chip.fields.round = v.round;
      } else if (field === "selYear") chip.fields.selYear = val as string;
      else if (field === "who") chip.fields.who = val as ChipFields["who"];
      else if (field === "selWho") chip.fields.selWho = val as string;

      if (activeChip) {
        // Replace the chip immediately before the cursor — it
        // stays in place; cursor doesn't move.
        next[cursor - 1] = chip;
      } else {
        // Insert a brand-new chip at the cursor and step over it
        // so the next slot can be filled in the same chip.
        next.splice(cursor, 0, chip);
        cursorAdvance = 1;
      }
      return next;
    });
    if (cursorAdvance) setCursor((c) => c + cursorAdvance);
  };

  const registerSelector = (name: string, slot: SelectorRecord["slot"]): void => {
    setSelectors((arr) => {
      if (arr.some((s) => s.name === name)) return arr;
      const typeHint =
        activeChip?.kind === "chip" ? (activeChip.fields.type ?? null) : null;
      return [...arr, { name, slot, typeHint }];
    });
  };

  const accept = (s: Suggestion | undefined): void => {
    if (!s) return;
    if (s.action === "op") {
      setTokens((arr) => {
        const next = arr.slice();
        next.splice(cursor, 0, { kind: "op", value: s.op });
        return next;
      });
      setCursor((c) => c + 1);
    } else if (s.action === "paren") {
      setTokens((arr) => {
        const next = arr.slice();
        next.splice(cursor, 0, { kind: "paren", value: s.paren });
        return next;
      });
      setCursor((c) => c + 1);
    } else if (s.action === "num") {
      setTokens((arr) => {
        const next = arr.slice();
        next.splice(cursor, 0, { kind: "num", value: s.num });
        return next;
      });
      setCursor((c) => c + 1);
    } else if (s.action === "setField") {
      applyToActiveChip(s.field, s.value);
      if (s.field.startsWith("sel")) {
        registerSelector(s.value as string, s.field as SelectorRecord["slot"]);
      }
    }
    setValue("");
    setOpen(true);
    focusInput();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, suggestions.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      }
    } else if (e.key === "ArrowLeft") {
      // Move the insertion cursor one chip to the left when there's
      // no in-input text to navigate. Falls through to the native
      // text-cursor behaviour while the user is typing.
      if (value === "" && cursor > 0) {
        e.preventDefault();
        setCursor((c) => c - 1);
        setOpen(true);
      }
    } else if (e.key === "ArrowRight") {
      if (value === "" && cursor < tokens.length) {
        e.preventDefault();
        setCursor((c) => c + 1);
        setOpen(true);
      }
    } else if (e.key === "Enter") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        accept(suggestions[idx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if ((e.key === "Backspace" || e.key === "Delete") && value === "") {
      // Backspace removes (or strips a slot from) the token
      // immediately before the cursor — was always "the trailing
      // token" before, now follows wherever the cursor is.
      if (cursor === 0) return;
      e.preventDefault();
      setTokens((arr) => {
        const before = arr[cursor - 1];
        if (!before) return arr;
        if (before.kind === "chip") {
          const stripped = stripLastField(before);
          if (!stripped) {
            return [...arr.slice(0, cursor - 1), ...arr.slice(cursor)];
          }
          return [
            ...arr.slice(0, cursor - 1),
            stripped,
            ...arr.slice(cursor),
          ];
        }
        return [...arr.slice(0, cursor - 1), ...arr.slice(cursor)];
      });
      // If we removed the token outright (rather than stripping a
      // slot), the cursor should slide left by one to stay in
      // place. We can't observe inside the setter, so check on the
      // next tick — simpler: only decrement when the chip can't be
      // stripped further, which is exactly `stripLastField === null`.
      const before = tokens[cursor - 1];
      if (
        !before ||
        before.kind !== "chip" ||
        stripLastField(before) === null
      ) {
        setCursor((c) => Math.max(0, c - 1));
      }
    }
  };

  const removeTokenAt = (i: number): void => {
    setTokens((arr) => arr.filter((_, j) => j !== i));
    // Keep the cursor pinned to its visual position when a token to
    // the left is removed — without this, deleting a chip via its
    // ✕ button would silently push the input one slot to the right.
    setCursor((c) => (i < c ? c - 1 : c));
  };

  const candidatesAvailable = activeField === "who" && candidates.length > 0;
  const fieldPrompt =
    activeField === "type"
      ? 'vaalin tyyppi… (esim. "Eduskuntavaalit")'
      : activeField === "year"
        ? 'vuosi… (esim. 2023)'
        : activeField === "who"
          ? whoMode === "candidate"
            ? "etsi ehdokasta nimellä…"
            : "puolue tai $-valitsin…"
          : "";

  const isEmpty = tokens.length === 0 && value === "";

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink)",
          opacity: 0.85,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span>Kaava</span>
        <span
          style={{
            opacity: 0.85,
            textTransform: "none",
            letterSpacing: 0,
            fontSize: 12,
            fontStyle: "italic",
            fontWeight: 400,
          }}
        >
          {activeChip ? (
            <>
              Täydennä — seuraava: <b style={{ fontStyle: "normal" }}>{activeField}</b>
            </>
          ) : (
            <>Aloita uusi termi tai operaattori</>
          )}
        </span>
      </div>

      <div
        onMouseDown={(e) => {
          // Click on empty padding inside the chip row → drop the
          // cursor at the end and focus the input. Click on a chip
          // is handled below; this only fires when the click hit
          // the row itself, not a child.
          if (e.target === e.currentTarget) {
            setCursor(tokens.length);
            focusInput();
          }
        }}
        style={{
          minHeight: 60,
          border: "var(--border-default) solid var(--line)",
          borderRadius: "var(--radius-card)",
          background: "var(--paper-2)",
          padding: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          cursor: "text",
          position: "relative",
        }}
      >
        {/* Chips + input share one flex row. The input is rendered
            ONCE in a fixed DOM position (after the chip map), and
            `order` slots it visually wherever the cursor sits. This
            keeps the same `<input>` element mounted across cursor
            moves so it doesn't lose focus mid-navigation — the
            previous "render input inside the map" approach killed
            focus on every ArrowLeft press. */}
        {tokens.map((t, i) => (
          <ChipPill
            key={`chip-${i}`}
            chip={t}
            order={i < cursor ? i : i + 1}
            onClick={() => {
              setCursor(i);
              setValue("");
              setOpen(true);
              focusInput();
            }}
            onRemove={() => removeTokenAt(i)}
          />
        ))}
        <CursorInput
          inputRef={inputRef}
          value={value}
          placeholder={isEmpty ? 'Kirjoita — esim. "eduskuntavaalit"' : fieldPrompt}
          onChangeValue={(v) => {
            setValue(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          inline={cursor < tokens.length}
          order={cursor}
        />

        {open && (suggestions.length > 0 || candidatesAvailable) ? (
          <div
            style={{
              position: "absolute",
              zIndex: 10,
              left: -1,
              right: -1,
              top: "calc(100% + 4px)",
              background: "var(--paper)",
              border: "var(--border-default) solid var(--line)",
              borderRadius: "var(--radius-box)",
              boxShadow: "var(--shadow-pop)",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {candidatesAvailable ? (
              <WhoModeToggle value={whoMode} onChange={setWhoMode} />
            ) : null}
            {suggestions.map((s, i) => {
              return (
              <div key={`row-${s.id}`}>
              <div
                key={s.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
                onMouseEnter={() => setIdx(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: i === idx ? "rgba(0,0,0,0.07)" : "transparent",
                  borderTop: i === 0 ? "none" : "1px dotted var(--hair)",
                }}
              >
                <SuggestionGlyph s={s} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ink)",
                      opacity: 0.7,
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.sub}
                  </span>
                </span>
                {i === idx ? (
                  <span
                    style={{
                      fontSize: 10,
                      opacity: 0.5,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    ↵
                  </span>
                ) : null}
              </div>
              </div>
            );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span
          style={{ fontSize: 11.5, color: "var(--ink)", opacity: 0.8 }}
        >
          {tokens.length} {tokens.length === 1 ? "elementti" : "elementtiä"}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--ink)",
            opacity: 0.75,
            marginLeft: "auto",
          }}
        >
          ↵ valitse · ↑↓ navigoi · ←→ siirrä kursoria · ⌫ poista edellinen · ✕ poista chip · klikkaa chippiä siirtääksesi kursorin
        </span>
      </div>
    </div>
  );
}

/* ─── Chip pill renderer ───────────────────────────────────── */

function ChipPill({
  chip,
  onClick,
  onRemove,
  order,
}: {
  chip: FormulaToken;
  /** Click anywhere on the chip body — drops the cursor in front
   *  of it so the user can edit at that position. The ✕ remove
   *  button stops propagation so it doesn't double-fire. */
  onClick?: () => void;
  onRemove?: () => void;
  /** CSS flex `order`. The composer renders chips + the input all
   *  in one flex row; `order` is how the input visually slots in at
   *  the cursor position without changing its DOM position. */
  order?: number;
}): JSX.Element {
  const clickHandler = onClick
    ? {
        onMouseDown: (e: React.MouseEvent) => {
          // preventDefault keeps the input's blur from firing first
          // (which would close the suggestion dropdown).
          e.preventDefault();
          onClick();
        },
        style: { cursor: "pointer" as const, order },
      }
    : { style: { order } };
  if (chip.kind === "op") {
    return (
      <span
        {...clickHandler}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 9px",
          border: "var(--border-default) solid var(--ink)",
          background: "var(--ink)",
          color: "var(--paper)",
          borderRadius: "var(--radius-chip)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          ...clickHandler.style,
        }}
      >
        {chip.value}
      </span>
    );
  }
  if (chip.kind === "paren") {
    return (
      <span
        {...clickHandler}
        style={{
          display: "inline-flex",
          padding: "3px 9px",
          border: "var(--border-default) solid var(--line)",
          borderRadius: "var(--radius-chip)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          ...clickHandler.style,
        }}
      >
        {chip.value}
      </span>
    );
  }
  if (chip.kind === "num") {
    return (
      <span
        {...clickHandler}
        style={{
          display: "inline-flex",
          padding: "3px 8px",
          border: "var(--border-default) solid var(--line)",
          background: "var(--paper-2)",
          borderRadius: "var(--radius-chip)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          ...clickHandler.style,
        }}
      >
        {chip.value}
      </span>
    );
  }

  // Data chip
  const f = chip.fields;
  const hasSel = Boolean(f.selType || f.selYear || f.selWho);
  // Pick the party color for both party chips and candidate chips
  // (candidates carry their party affiliation), so the chip pill
  // visually conveys "Haavisto = green" without the user needing
  // to recall it.
  const partyId =
    f.who && "party" in f.who
      ? f.who.party
      : f.who && "candidate" in f.who
        ? f.who.candidate.party
        : null;
  const knownParty =
    partyId !== null && /^[a-z]+$/i.test(partyId) && !partyId.startsWith("_");
  const bg = knownParty ? `var(--p-${partyId})` : hasSel ? "#f4e6c3" : "#e9e2cf";
  const color = knownParty ? "#fff" : "var(--ink)";
  const border = hasSel ? "var(--ink)" : "var(--line)";
  const borderStyle = hasSel ? "dashed" : "solid";
  return (
    <span
      {...clickHandler}
      title={chipFullText(f)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        border: `var(--border-default) ${borderStyle} ${border}`,
        borderRadius: "var(--radius-pill)",
        background: bg,
        color,
        fontSize: 13,
        whiteSpace: "nowrap",
        ...clickHandler.style,
      }}
    >
      {chipText(f)}
      {onRemove ? (
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          style={{ opacity: 0.7, fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </span>
      ) : null}
    </span>
  );
}

/** Cursor-position-aware input. Renders inline (squished narrow)
 *  when sitting between chips, and at the trailing end fills the
 *  remaining row so the placeholder stays readable. The wrapper
 *  carries a flex `order` so the same DOM-stable input can be
 *  visually slotted between chips when the cursor moves. */
function CursorInput({
  inputRef,
  value,
  placeholder,
  onChangeValue,
  onFocus,
  onBlur,
  onKeyDown,
  inline = false,
  order,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  placeholder: string;
  onChangeValue: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inline?: boolean;
  order?: number;
}): JSX.Element {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        flex: inline ? "0 1 auto" : "1 1 180px",
        minWidth: inline ? 8 : 180,
        // When sitting between two chips, render a thin vertical
        // bar as a cursor caret so the user sees where the next
        // token will land.
        borderLeft: inline ? "1.5px solid var(--ink)" : "none",
        marginLeft: inline ? 2 : 0,
        paddingLeft: inline ? 2 : 0,
        order,
      }}
    >
      <input
        ref={inputRef}
        value={value}
        placeholder={inline && value === "" ? "" : placeholder}
        onChange={(e) => onChangeValue(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        aria-label="Kaavan rakentaja"
        size={inline ? Math.max(1, value.length || 1) : undefined}
        style={{
          flex: inline ? "0 1 auto" : 1,
          minWidth: inline ? 4 : 120,
          width: inline ? `${Math.max(1, value.length || 1)}ch` : undefined,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 14,
          padding: "3px 2px",
          color: "var(--ink)",
        }}
      />
    </span>
  );
}

/** Inline toggle pinned to the top of the suggestion dropdown when
 *  the chip's election has candidate data — lets the user pick
 *  between selecting a party or searching for a specific candidate. */
function WhoModeToggle({
  value,
  onChange,
}: {
  value: WhoMode;
  onChange: (m: WhoMode) => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "8px 10px",
        borderBottom: "var(--border-default) dotted var(--hair)",
        background: "var(--paper-2)",
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      {(["party", "candidate"] as WhoMode[]).map((m) => {
        const active = value === m;
        return (
          <span
            key={m}
            className={"pill " + (active ? "on" : "")}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(m);
            }}
            role="button"
            tabIndex={0}
            style={{
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 10px",
            }}
          >
            {m === "party" ? "Puolue" : "Ehdokas"}
          </span>
        );
      })}
    </div>
  );
}

/* ─── Suggestion-row glyph ──────────────────────────────────── */

function SuggestionGlyph({ s }: { s: Suggestion }): JSX.Element {
  const box: React.CSSProperties = {
    width: 22,
    height: 22,
    flex: "0 0 22px",
    border: "var(--border-thin) solid var(--line)",
    borderRadius: "var(--radius-chip)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    background: "var(--paper)",
  };

  if (s.kind === "op" || s.kind === "paren") {
    return (
      <span
        style={{ ...box, background: "var(--ink)", color: "var(--paper)", fontWeight: 700 }}
      >
        {s.label}
      </span>
    );
  }
  if (s.kind === "num") return <span style={box}>#</span>;
  if (s.kind === "type") return <span style={{ ...box, background: "var(--paper-2)" }}>T</span>;
  if (s.kind === "year") return <span style={{ ...box, background: "var(--paper-2)" }}>Y</span>;
  if (s.kind === "party") {
    const pid = s.id.replace(/^party-/, "");
    return (
      <span
        style={{
          ...box,
          background: `var(--p-${pid})`,
          borderColor: `var(--p-${pid})`,
        }}
      />
    );
  }
  if (s.kind === "candidate") {
    const pid = s.value.candidate.party;
    return (
      <span
        style={{
          ...box,
          background: `var(--p-${pid})`,
          borderColor: `var(--p-${pid})`,
          color: "#fff",
          fontWeight: 700,
        }}
      >
        ●
      </span>
    );
  }
  if (s.kind === "selector") {
    return <span style={{ ...box, background: "#f4e6c3", borderStyle: "dashed" }}>$</span>;
  }
  return <span style={box}>•</span>;
}
