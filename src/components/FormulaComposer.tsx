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
}

export function FormulaComposer({
  tokens,
  setTokens,
  selectors,
  setSelectors,
  loadCandidatesForElection,
}: FormulaComposerProps): JSX.Element {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Active chip = the trailing chip if it's still incomplete, else null.
  const lastChip = tokens[tokens.length - 1];
  const activeChip =
    lastChip && lastChip.kind === "chip" && !chipIsComplete(lastChip) ? lastChip : null;
  const activeField = activeChip ? nextFieldFor(activeChip) : "type";

  // Reset highlighted index whenever the query or slot changes.
  useEffect(() => {
    setIdx(0);
  }, [value, activeField]);

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

  const suggestions = useMemo(
    () =>
      buildSuggestions(value, activeField, activeChip, selectors, candidates),
    [value, activeField, activeChip, selectors, candidates],
  );

  const focusInput = (): void => {
    inputRef.current?.focus();
  };

  const applyToActiveChip = (
    field: "type" | "selType" | "year" | "selYear" | "who" | "selWho",
    val: unknown,
  ): void => {
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

      if (activeChip) next[next.length - 1] = chip;
      else next.push(chip);
      return next;
    });
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
      setTokens((arr) => [...arr, { kind: "op", value: s.op }]);
    } else if (s.action === "paren") {
      setTokens((arr) => [...arr, { kind: "paren", value: s.paren }]);
    } else if (s.action === "num") {
      setTokens((arr) => [...arr, { kind: "num", value: s.num }]);
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
    } else if (e.key === "Enter") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        accept(suggestions[idx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if ((e.key === "Backspace" || e.key === "Delete") && value === "") {
      e.preventDefault();
      setTokens((arr) => {
        if (arr.length === 0) return arr;
        const last = arr[arr.length - 1]!;
        if (last.kind === "chip") {
          const stripped = stripLastField(last);
          if (!stripped) return arr.slice(0, -1);
          return [...arr.slice(0, -1), stripped];
        }
        return arr.slice(0, -1);
      });
    }
  };

  const removeTokenAt = (i: number): void => {
    setTokens((arr) => arr.filter((_, j) => j !== i));
  };

  const fieldPrompt =
    activeField === "type"
      ? 'vaalin tyyppi… (esim. "Eduskuntavaalit")'
      : activeField === "year"
        ? 'vuosi… (esim. 2023)'
        : activeField === "who"
          ? "puolue tai $-valitsin…"
          : "";

  const isEmpty = tokens.length === 0 && value === "";

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
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
            opacity: 0.7,
            textTransform: "none",
            letterSpacing: 0,
            fontSize: 11,
            fontStyle: "italic",
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
          if (e.target === e.currentTarget) focusInput();
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
        {tokens.map((t, i) => (
          <ChipPill
            key={`${i}-${tokenSig(t)}`}
            chip={t}
            onRemove={() => removeTokenAt(i)}
          />
        ))}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            position: "relative",
            flex: "1 1 180px",
            minWidth: 180,
          }}
        >
          <input
            ref={inputRef}
            value={value}
            placeholder={isEmpty ? 'Kirjoita — esim. "eduskuntavaalit"' : fieldPrompt}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            aria-label="Kaavan rakentaja"
            style={{
              flex: 1,
              minWidth: 120,
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

        {open && suggestions.length > 0 ? (
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
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {suggestions.map((s, i) => (
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
                      fontSize: 10,
                      opacity: 0.55,
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
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, opacity: 0.55 }}>
          {tokens.length} {tokens.length === 1 ? "elementti" : "elementtiä"}
        </span>
        <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
          ↵ valitse · ↑↓ navigoi · ⌫ poista viimeinen kenttä · ✕ poista chip
        </span>
      </div>
    </div>
  );
}

/* ─── Chip pill renderer ───────────────────────────────────── */

function tokenSig(t: FormulaToken): string {
  if (t.kind === "num") return `n${t.value}`;
  if (t.kind === "op") return `o${t.value}`;
  if (t.kind === "paren") return `p${t.value}`;
  return `c${JSON.stringify(t.fields)}`;
}

function ChipPill({
  chip,
  onRemove,
}: {
  chip: FormulaToken;
  onRemove?: () => void;
}): JSX.Element {
  if (chip.kind === "op") {
    return (
      <span
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
        }}
      >
        {chip.value}
      </span>
    );
  }
  if (chip.kind === "paren") {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "3px 9px",
          border: "var(--border-default) solid var(--line)",
          borderRadius: "var(--radius-chip)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
        }}
      >
        {chip.value}
      </span>
    );
  }
  if (chip.kind === "num") {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "3px 8px",
          border: "var(--border-default) solid var(--line)",
          background: "var(--paper-2)",
          borderRadius: "var(--radius-chip)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
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
