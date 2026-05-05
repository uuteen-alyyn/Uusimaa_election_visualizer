/**
 * WorkflowBuilder — modal popover wrapping the FormulaComposer.
 *
 * Ported from `prototype/wf-workflows.jsx`'s WorkflowBuilder.
 * Two modes:
 *   - new (initial.id is null/undefined): creates a new custom
 *     workflow on save. The bar grows a new pill.
 *   - edit (initial.id set): updates the existing workflow. The
 *     pill in the bar updates in place; the user's saved formula
 *     and selector labels carry over unchanged when possible.
 */

import { useMemo, useState } from "react";

import { FormulaComposer } from "./FormulaComposer";
import { evalFormula, formulaSummary } from "../lib/formula";
import type { SelectorRecord } from "../lib/composer-suggestions";
import type {
  Candidate,
  ElectionId,
  FormulaToken,
  Workflow,
} from "../types/elections";

interface WorkflowBuilderProps {
  /** When `initial.id` is set, the modal is in edit mode. */
  initial?: Partial<Workflow> | null;
  onSave: (w: Workflow) => void;
  onUpdate?: (w: Workflow) => void;
  onClose: () => void;
  /** Async lookup for candidates of a given election — used by the
   *  composer to surface candidate chip suggestions once a chip's
   *  type+year (and round, for pres) are resolved. */
  loadCandidatesForElection?: (electionId: ElectionId) => Promise<Candidate[]>;
  /** Election ids known to have data — used to filter the year picker
   *  in the composer so future / no-data elections are hidden. */
  availableElectionIds?: ReadonlySet<ElectionId> | null;
}

export function WorkflowBuilder({
  initial,
  onSave,
  onUpdate,
  onClose,
  loadCandidatesForElection,
  availableElectionIds,
}: WorkflowBuilderProps): JSX.Element {
  const isEdit = Boolean(initial?.id);
  const [tokens, setTokens] = useState<FormulaToken[]>(initial?.formula ?? []);
  const [name, setName] = useState<string>(initial?.label ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  // Default to true for new custom workflows: Ahvenanmaa breaks
  // most adaptive ramps because it has no votes for the mainland
  // parties. Existing workflows that already opted into including
  // it (false) keep that choice on edit.
  const [excludeAhvenanmaa, setExcludeAhvenanmaa] = useState<boolean>(
    initial?.excludeAhvenanmaa ?? true,
  );
  const [selectors, setSelectors] = useState<SelectorRecord[]>(
    () => deriveSelectorsFromTokens(initial?.formula ?? []),
  );
  const [selectorLabels, setSelectorLabels] = useState<Record<string, string>>(
    initial?.selectorLabels ?? {},
  );

  const activeSelectors = useMemo(
    () => deriveSelectorsFromTokens(tokens),
    [tokens],
  );

  const hasUnboundSelectors = activeSelectors.length > 0;

  // Syntax check — run the evaluator against a no-op data lookup,
  // then ignore the data-shaped errors that are expected at build
  // time. Surfaces structural problems (empty / mismatched parens /
  // trailing operator / two-values-in-a-row) inline.
  const syntaxError = useMemo<string | null>(() => {
    if (tokens.length === 0) return null;
    const r = evalFormula(tokens, "__validate__", () => null);
    if (r.ok) return null;
    const ignorable = new Set(["unbound selector", "no data for chip"]);
    if (ignorable.has(r.error)) return null;
    return r.error;
  }, [tokens]);

  const canSave = tokens.length > 0 && syntaxError === null;

  const autoLabel = (): string => {
    const s = formulaSummary(tokens) || "kaava";
    return s.replace(/^ƒ\s*/, "").slice(0, 44);
  };

  const handleSave = (): void => {
    if (!canSave) return;
    const labelText = (name.trim() || autoLabel()).slice(0, 48);
    const trimmedDesc = description.trim();
    const descField =
      trimmedDesc.length > 0 ? { description: trimmedDesc } : {};
    const ahveField = { excludeAhvenanmaa };
    if (isEdit && initial?.id && onUpdate) {
      onUpdate({
        id: initial.id,
        kind: "formula",
        election: initial.election ?? "ek2023",
        label: labelText,
        formula: tokens,
        selectorLabels,
        ...descField,
        ...ahveField,
      });
    } else {
      onSave({
        id: "wf-" + Math.random().toString(36).slice(2, 9),
        kind: "formula",
        election: "ek2023",
        label: labelText,
        formula: tokens,
        selectorLabels,
        ...descField,
        ...ahveField,
      });
    }
    onClose();
  };

  return (
    <div
      className="workflow-builder-backdrop"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(26,26,26,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="box workflow-builder-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: "100%",
          maxHeight: "calc(100dvh - 48px)",
          overflowY: "auto",
          padding: 20,
          boxShadow: "var(--shadow-deep)",
          background: "var(--paper)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {isEdit ? "Muokkaa kaavaa" : "Mukautettu kaava"}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink)",
                opacity: 0.8,
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              Rakenna alueittainen arvo puolueosuuksista, kannatuksen
              muutoksista ja äänestysprosenteista.
            </div>
          </div>
          <span
            onClick={onClose}
            style={{
              cursor: "pointer",
              opacity: 0.75,
              fontSize: 18,
              color: "var(--ink)",
              padding: "2px 8px",
              lineHeight: 1,
            }}
            role="button"
            aria-label="Sulje"
          >
            ✕
          </span>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Nimi</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={autoLabel() || "esim. Kok kannatuksen muutos 2019→2023"}
            style={{
              width: "100%",
              border: "var(--border-default) solid var(--line)",
              background: "var(--paper-2)",
              padding: "7px 10px",
              borderRadius: "var(--radius-box)",
              fontFamily: "inherit",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--ink)",
              opacity: 0.75,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Tyhjä → nimi muodostetaan kaavasta automaattisesti.
          </div>
        </div>

        {/* Composer */}
        <FormulaComposer
          tokens={tokens}
          setTokens={setTokens}
          selectors={selectors}
          setSelectors={setSelectors}
          loadCandidatesForElection={loadCandidatesForElection}
          availableElectionIds={availableElectionIds ?? null}
        />

        {/* Lisätietoja — free-text description shown next to the
            formula's value in the Ledger when this kaava is applied. */}
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Lisätietoja</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 600))}
            placeholder="Selitä lyhyesti, mitä kaava kuvaa ja miten sitä luetaan…"
            rows={3}
            style={{
              width: "100%",
              border: "var(--border-default) solid var(--line)",
              background: "var(--paper-2)",
              padding: "7px 10px",
              borderRadius: "var(--radius-box)",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.45,
              resize: "vertical",
              minHeight: 60,
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--ink)",
              opacity: 0.75,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Valinnainen — näkyy Ledger-paneelissa kaavan arvon vieressä.
          </div>
        </div>

        {/* Älä huomioi Ahvenanmaata — Ahvenanmaa has no votes for
            mainland parties, so including it collapses most ramps. */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={excludeAhvenanmaa}
              onChange={(e) => setExcludeAhvenanmaa(e.target.checked)}
              style={{ accentColor: "var(--ink)" }}
            />
            <span>Älä huomioi Ahvenanmaata</span>
          </label>
          <div
            style={{
              fontSize: 11,
              color: "var(--ink)",
              opacity: 0.75,
              marginTop: 4,
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
          >
            Ahvenanmaalla ei ole ääniä mantereen puolueille — sen
            mukaan ottaminen romahduttaa väriliukuman muille alueille.
            Suositus: pidä päällä.
          </div>
        </div>

        {/* Selector friendly names */}
        {activeSelectors.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              border: "var(--border-default) dashed var(--line)",
              borderRadius: "var(--radius-card)",
              background: "var(--paper)",
            }}
          >
            <FieldLabel style={{ marginBottom: 8 }}>Nimeä valitsimet</FieldLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeSelectors.map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      border: "var(--border-default) dashed var(--ink)",
                      borderRadius: "var(--radius-pill)",
                      background: "#f4e6c3",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 11,
                      minWidth: 26,
                      justifyContent: "center",
                    }}
                  >
                    ${s.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--ink)",
                      opacity: 0.85,
                      width: 110,
                    }}
                  >
                    {s.slot === "selType"
                      ? "vaalin tyyppi"
                      : s.slot === "selYear"
                        ? "vuosi"
                        : "puolue"}
                  </span>
                  <input
                    value={selectorLabels[s.name] ?? ""}
                    onChange={(e) =>
                      setSelectorLabels((prev) => ({ ...prev, [s.name]: e.target.value }))
                    }
                    placeholder={`esim. "Vertailu ${s.slot === "selType" ? "tyyppi" : s.slot === "selYear" ? "vuosi" : "puolue"}"`}
                    style={{
                      flex: 1,
                      border: "var(--border-default) solid var(--line)",
                      background: "var(--paper-2)",
                      padding: "5px 8px",
                      borderRadius: "var(--radius-box)",
                      fontFamily: "inherit",
                      fontSize: 12,
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--ink)",
                opacity: 0.75,
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              Nämä nimet näkyvät päänäkymän valitsinpalkissa.
            </div>
          </div>
        ) : null}

        {/* Inline status: syntax error, selector hint, or empty hint. */}
        <div
          style={{
            marginTop: 14,
            fontSize: 12.5,
            padding: "8px 10px",
            border: "1px dotted var(--hair)",
            borderRadius: "var(--radius-box)",
            background: syntaxError ? "rgba(196,58,58,0.08)" : "transparent",
            color: syntaxError ? "#b94a2a" : "var(--ink)",
            opacity: syntaxError ? 1 : 0.85,
            fontStyle: syntaxError ? "normal" : "italic",
          }}
          role={syntaxError ? "alert" : undefined}
        >
          {syntaxError ? (
            <>
              <strong style={{ fontStyle: "normal" }}>⚠ Virhe:</strong>{" "}
              {translateFormulaError(syntaxError)}
            </>
          ) : tokens.length === 0 ? (
            <>Lisää termejä kaavaan tallentaaksesi.</>
          ) : hasUnboundSelectors ? (
            <>
              Kaavassa on valitsimia ($A / $B / …) — päänäkymä sitoo ne
              arvoonsa, kun työkalua käytetään.
            </>
          ) : (
            <>Kaava on valmis tallennettavaksi.</>
          )}
        </div>

        <div style={{ borderTop: "1px dashed var(--hair)", margin: "14px 0" }} />

        {/* Save / Cancel */}
        <div style={{ display: "flex", gap: 8 }}>
          <span
            className="btn"
            onClick={handleSave}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSave();
              }
            }}
            style={{
              flex: 1,
              textAlign: "center",
              cursor: canSave ? "pointer" : "not-allowed",
              fontSize: 13,
              padding: "9px 12px",
              opacity: canSave ? 1 : 0.4,
              background: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            {isEdit ? "Tallenna muutokset" : "Tallenna ja käytä"}
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            opacity: 0.55,
            marginTop: 6,
            fontStyle: "italic",
            textAlign: "center",
          }}
        >
          {isEdit
            ? "Muutos päivittää olemassa olevan kaavan."
            : "Kaava tallennetaan automaattisesti omaksi nappuloiksi."}
        </div>
      </div>
    </div>
  );
}

/** Map an evalFormula error string to a Finnish, user-friendly form. */
function translateFormulaError(err: string): string {
  switch (err) {
    case "empty formula":
      return "Kaava on tyhjä.";
    case "two values in a row":
      return "Kahden termin välistä puuttuu operaattori.";
    case "operator needs a value before it":
      return "Operaattorin edessä pitää olla termi.";
    case "missing operator before (":
      return "Sulun edessä pitää olla operaattori.";
    case "empty parentheses":
      return "Tyhjät sulut — lisää termi sulkujen sisään.";
    case "mismatched (":
      return "Sulkulauseke on epätäydellinen — lisää sulkeva sulku.";
    case "mismatched )":
      return "Sulkulauseke on epätäydellinen — poista ylimääräinen sulkeva sulku.";
    case "formula ends on an operator":
      return "Kaava päättyy operaattoriin — lisää viimeinen termi.";
    case "candidate metric not yet supported":
      return "Ehdokaspohjainen kaava ei ole vielä tuettu — käytä puoluetermejä.";
    default:
      return err;
  }
}

function FieldLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div
      style={{
        // Bigger + higher contrast than the surrounding labels — the
        // light paper-2 background made the original 10 px @ 0.6
        // opacity hard to read.
        fontSize: 11,
        // Direct ink color at 85 % beats opacity for dark text on
        // a near-white background — opacity blends with the page
        // tint and looks washed out.
        color: "var(--ink)",
        opacity: 0.85,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Walk a token list and reconstruct the selector list (preserving
 *  the prototype's $A/$B/$C ordering by first appearance). */
function deriveSelectorsFromTokens(tokens: FormulaToken[]): SelectorRecord[] {
  const seen = new Map<string, SelectorRecord>();
  for (const t of tokens) {
    if (t.kind !== "chip") continue;
    const f = t.fields;
    if (f.selType && !seen.has(f.selType)) {
      seen.set(f.selType, { name: f.selType, slot: "selType", typeHint: f.type ?? null });
    }
    if (f.selYear && !seen.has(f.selYear)) {
      seen.set(f.selYear, { name: f.selYear, slot: "selYear", typeHint: f.type ?? null });
    }
    if (f.selWho && !seen.has(f.selWho)) {
      seen.set(f.selWho, { name: f.selWho, slot: "selWho", typeHint: f.type ?? null });
    }
  }
  return [...seen.values()];
}
