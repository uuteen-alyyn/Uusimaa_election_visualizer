/**
 * Pure helpers for the formula composer's progressive suggestion
 * list. Ported from `prototype/wf-suggest.jsx:19-231`.
 *
 * Kept separate from the React component so the scoring + chip-state
 * logic stays unit-testable.
 *
 * Candidate chips (`f.who.candidate`) are offered when the active
 * chip's election is fully resolved (type + year, plus round for
 * presidential) and the caller passes that election's candidate
 * list via the `candidatesForElection` arg.
 */

import {
  ELECTION_TYPE_BY_ID,
  ELECTION_TYPES,
  ELECTIONS,
  PARTIES,
  PARTY_BY_ID,
} from "../data/catalog";
import type {
  Candidate,
  ChipFields,
  ElectionId,
  ElectionTypeId,
  FormulaToken,
  PartyId,
} from "../types/elections";

/** Which "who" sub-mode the composer is in — only meaningful when
 *  `activeField === "who"`. The composer renders an inline toggle
 *  to switch between picking a party or searching for a specific
 *  candidate; suggestions filter accordingly. */
export type WhoMode = "party" | "candidate";

/* ─── Progressive chip display text ─────────────────────────── */

/** Compact label shown inside a chip pill — handles partial chips
 *  (the user has filled type but not year yet, etc.). Matches the
 *  prototype's "EK · 2023 · Kok" shape with selectors as `$A`. */
export function chipText(fields: ChipFields): string {
  const parts: string[] = [];

  if (fields.selType) parts.push(`$${fields.selType}`);
  else if (fields.type) parts.push(ELECTION_TYPE_BY_ID[fields.type]?.short ?? fields.type);

  if (fields.selYear) parts.push(`$${fields.selYear}`);
  else if (fields.year) {
    if (fields.type === "pres" && fields.round) {
      parts.push(`${fields.year}·${fields.round === 2 ? "II" : "I"}`);
    } else {
      parts.push(String(fields.year));
    }
  }

  if (fields.selWho) parts.push(`$${fields.selWho}`);
  else if (fields.who) {
    if ("party" in fields.who) {
      parts.push(PARTY_BY_ID[fields.who.party]?.abbr ?? fields.who.party);
    } else if ("candidate" in fields.who) {
      const last = fields.who.candidate.name.split(" ").slice(-1)[0] ?? fields.who.candidate.name;
      parts.push(last);
    }
  }

  return parts.join(" · ") || "?";
}

/** Full descriptive label for the chip's `title` attribute (hover
 *  tooltip). Spells out the long election name + party name. */
export function chipFullText(fields: ChipFields): string {
  const parts: string[] = [];

  if (fields.selType) parts.push(`[selector ${fields.selType}]`);
  else if (fields.type) parts.push(ELECTION_TYPE_BY_ID[fields.type]?.label ?? fields.type);

  if (fields.selYear) parts.push(`[selector ${fields.selYear}]`);
  else if (fields.year) {
    if (fields.type === "pres" && fields.round) {
      parts.push(`${fields.year}, ${fields.round === 2 ? "2." : "1."} kierros`);
    } else {
      parts.push(String(fields.year));
    }
  }

  if (fields.selWho) parts.push(`[selector ${fields.selWho}]`);
  else if (fields.who) {
    if ("party" in fields.who) {
      parts.push(PARTY_BY_ID[fields.who.party]?.name ?? fields.who.party);
    } else if ("candidate" in fields.who) {
      parts.push(fields.who.candidate.name);
    }
  }

  return parts.join(", ");
}

/* ─── Slot model ────────────────────────────────────────────── */

/** Which of the chip's three slots needs to be filled next.
 *  `null` means the chip is complete. */
export type ChipSlot = "type" | "year" | "who" | null;

export function chipIsComplete(t: FormulaToken): boolean {
  if (t.kind !== "chip") return true;
  const f = t.fields;
  return Boolean(
    (f.type || f.selType) && (f.year || f.selYear) && (f.who || f.selWho),
  );
}

export function nextFieldFor(chip: FormulaToken | null): ChipSlot {
  if (!chip || chip.kind !== "chip") return "type";
  const f = chip.fields;
  if (!(f.type || f.selType)) return "type";
  if (!(f.year || f.selYear)) return "year";
  if (!(f.who || f.selWho)) return "who";
  return null;
}

/** Strip the last filled slot off a chip (Backspace at empty input).
 *  Returns `null` if removing leaves an empty chip — caller should
 *  drop it from the token list. */
export function stripLastField(chip: FormulaToken): FormulaToken | null {
  if (chip.kind !== "chip") return null;
  const f: ChipFields = { ...chip.fields };
  if (f.who || f.selWho) {
    delete f.who;
    delete f.selWho;
  } else if (f.year || f.selYear) {
    delete f.year;
    delete f.selYear;
    delete f.round;
  } else if (f.type || f.selType) {
    return null;
  }
  return { ...chip, fields: f };
}

/* ─── Scoring (from prototype/wf-suggest.jsx scoreOne / score) ── */

export function scoreOne(term: string, text: string): number {
  if (!term) return 0;
  const t = (text || "").toLowerCase();
  if (t === term) return 100;
  if (t.startsWith(term)) return 80 - t.length * 0.1;
  const words = t.split(/[\s·.\-_()]+/);
  for (const w of words) {
    if (w === term) return 70;
    if (w.startsWith(term)) return 60 - t.length * 0.05;
  }
  if (/^\d+$/.test(term)) {
    for (const w of words) if (w === term) return 75;
  }
  const idx = t.indexOf(term);
  if (idx >= 0) return 40 - idx * 0.5;
  const acro = words.map((w) => w[0] ?? "").join("");
  if (acro.startsWith(term)) return 50;
  return 0;
}

export function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const terms = q.split(/\s+/);
  if (terms.length === 1) return scoreOne(terms[0]!, text);
  let total = 0;
  for (const t of terms) {
    const s = scoreOne(t, text);
    if (s <= 0) return 0;
    total += s;
  }
  return total / terms.length;
}

/* ─── Selectors ─────────────────────────────────────────────── */

export interface SelectorRecord {
  /** Single-letter name, `"A"`–`"Z"`. */
  name: string;
  /** Which slot the selector occupies. */
  slot: "selType" | "selYear" | "selWho";
  /** Optional hint about the bound election type. */
  typeHint?: ElectionTypeId | null;
}

/** Pick the next available `$<name>` (`A`, `B`, …) given the
 *  selectors already in use. Falls back to `X` if all 26 are taken. */
export function pickNextSelectorName(selectors: ReadonlyArray<SelectorRecord>): string {
  const used = new Set(selectors.map((s) => s.name));
  for (let i = 0; i < 26; i++) {
    const n = String.fromCharCode(65 + i);
    if (!used.has(n)) return n;
  }
  return "X";
}

/* ─── Suggestion shapes ─────────────────────────────────────── */

interface BaseSuggestion {
  id: string;
  /** Display label in the suggestion row. */
  label: string;
  /** Subtitle / description (smaller text). */
  sub: string;
  /** Internal: ranking score; not exposed to the UI. */
  score: number;
}

export type Suggestion =
  | (BaseSuggestion & { kind: "op"; action: "op"; op: "+" | "-" | "*" | "/" })
  | (BaseSuggestion & { kind: "paren"; action: "paren"; paren: "(" | ")" })
  | (BaseSuggestion & { kind: "num"; action: "num"; num: number })
  | (BaseSuggestion & { kind: "type"; action: "setField"; field: "type"; value: ElectionTypeId })
  | (BaseSuggestion & { kind: "year"; action: "setField"; field: "year"; value: { year: number; round?: 1 | 2 } })
  | (BaseSuggestion & { kind: "party"; action: "setField"; field: "who"; value: { party: PartyId } })
  | (BaseSuggestion & { kind: "candidate"; action: "setField"; field: "who"; value: { candidate: { id: string; name: string; party: PartyId } } })
  | (BaseSuggestion & { kind: "selector"; action: "setField"; field: "selType" | "selYear" | "selWho"; value: string });

const OP_NAMES: Record<"+" | "-" | "*" | "/", string> = {
  "+": "plus",
  "-": "minus",
  "*": "times",
  "/": "divide",
};

/* ─── Main suggestion builder ──────────────────────────────── */

export function buildSuggestions(
  query: string,
  activeField: ChipSlot,
  activeChip: FormulaToken | null,
  selectors: ReadonlyArray<SelectorRecord>,
  candidatesForElection: ReadonlyArray<Candidate> | null = null,
  maxResults = 8,
  /** Filter year + type suggestions to elections in this set. When
   *  null, no availability filter is applied (used for tests). */
  availableElectionIds: ReadonlySet<ElectionId> | null = null,
  /** "party" or "candidate" sub-mode at the who slot. Only consulted
   *  when activeField === "who". Default party for backwards compat. */
  whoMode: WhoMode = "party",
): Suggestion[] {
  const q = query.trim();
  const out: Suggestion[] = [];
  const push = (s: Suggestion): void => {
    if (s.score > 0) out.push(s);
  };

  const canOp = !activeChip || chipIsComplete(activeChip);
  if (canOp) {
    for (const op of ["+", "-", "*", "/"] as const) {
      const literalMatch = q === op;
      const sc = literalMatch ? 95 : score(q, OP_NAMES[op]);
      push({
        id: `op-${op}`,
        kind: "op",
        label: op,
        sub: `operator (${OP_NAMES[op]})`,
        action: "op",
        op,
        score: sc,
      });
    }
    for (const p of ["(", ")"] as const) {
      if (q === p) {
        push({
          id: `paren-${p}`,
          kind: "paren",
          label: p,
          sub: "parenthesis",
          action: "paren",
          paren: p,
          score: 95,
        });
      }
    }
    if (q !== "" && !Number.isNaN(Number(q))) {
      const n = Number(q);
      push({
        id: `num-${n}`,
        kind: "num",
        label: String(n),
        sub: "number",
        action: "num",
        num: n,
        score: 90,
      });
    }
  }

  if (activeField === "type") {
    for (const t of ELECTION_TYPES) {
      // When the query is empty, give every type a baseline score
      // above the score-1 operators so all five fit in the
      // (capped) result list. Otherwise rank by the search score.
      // Without this, "Presidentinvaalit" — pushed last — drops
      // past the maxResults cut.
      const s =
        q === ""
          ? 50
          : Math.max(score(q, t.label), score(q, t.short), score(q, t.id));
      push({
        id: `type-${t.id}`,
        kind: "type",
        label: t.label,
        sub: "election type",
        action: "setField",
        field: "type",
        value: t.id,
        score: s,
      });
    }
    if (q === "" || score(q, "selector") > 0 || q.startsWith("$")) {
      const name = pickNextSelectorName(selectors);
      push({
        id: `sel-type`,
        kind: "selector",
        label: `$${name} — Election type selector`,
        sub: "adds a Ledger control for picking the type",
        action: "setField",
        field: "selType",
        value: name,
        score: 30,
      });
    }
  } else if (activeField === "year") {
    const curType =
      activeChip?.kind === "chip" ? activeChip.fields.type : undefined;
    const filtered = ELECTIONS.filter(
      (e) =>
        (!curType || e.typeId === curType) &&
        (!availableElectionIds || availableElectionIds.has(e.id)),
    );
    for (const e of filtered) {
      const pool = [String(e.year), e.label, e.shortLabel];
      if (e.typeId === "pres" && e.round) {
        pool.push(`${e.year} ${e.round}`, `kierros ${e.round}`);
      }
      let s = q === "" ? 50 : 0;
      for (const str of pool) s = Math.max(s, score(q, str));
      // Only the year — round disambiguator for pres ("· I" / "· II")
      // appended for clarity since a year hosts two pres rounds.
      const lbl =
        e.typeId === "pres" && e.round
          ? `${e.year} · ${e.round === 2 ? "II" : "I"}`
          : String(e.year);
      const value: { year: number; round?: 1 | 2 } = { year: e.year };
      if (e.round) value.round = e.round;
      // Sub stays empty so the dropdown reads as a clean year list.
      push({
        id: `yr-${e.id}`,
        kind: "year",
        label: lbl,
        sub: "",
        action: "setField",
        field: "year",
        value,
        score: s,
      });
    }
    if (q === "" || q.startsWith("$")) {
      const name = pickNextSelectorName(selectors);
      push({
        id: `sel-year`,
        kind: "selector",
        label: `$${name} — vuosi-valitsin`,
        sub: "lisää valitsimen Ledger-paneeliin",
        action: "setField",
        field: "selYear",
        value: name,
        score: 28,
      });
    }
  } else if (activeField === "who") {
    if (whoMode === "party") {
      for (const p of PARTIES) {
        const s =
          q === ""
            ? 50
            : Math.max(score(q, p.name), score(q, p.abbr), score(q, p.id));
        push({
          id: `party-${p.id}`,
          kind: "party",
          label: p.name,
          sub: `puolue · ${p.abbr}`,
          action: "setField",
          field: "who",
          value: { party: p.id },
          score: s,
        });
      }
      if (q === "" || q.startsWith("$")) {
        const name = pickNextSelectorName(selectors);
        push({
          id: `sel-who`,
          kind: "selector",
          label: `$${name} — puolue/ehdokas-valitsin`,
          sub: "lisää valitsimen Ledger-paneeliin",
          action: "setField",
          field: "selWho",
          value: name,
          score: 25,
        });
      }
    } else {
      // candidate sub-mode — show only the chip-election's candidates.
      // The query filters by name; with no query we surface the top
      // ~12 candidates so the user has something to click without
      // typing.
      if (candidatesForElection && candidatesForElection.length > 0) {
        for (const c of candidatesForElection) {
          const s = score(q, c.name);
          if (s <= 0 && q !== "") continue;
          const partyAbbr =
            PARTY_BY_ID[c.party]?.abbr ?? c.party.replace(/^_/, "").toUpperCase();
          push({
            id: `cand-${c.id}`,
            kind: "candidate",
            label: c.name,
            sub: `ehdokas · ${partyAbbr}`,
            action: "setField",
            field: "who",
            value: { candidate: { id: c.id, name: c.name, party: c.party } },
            // Top candidates first when the query is empty (they're
            // already in vote-desc order from listCandidates).
            score: q === "" ? 1 : s,
          });
        }
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxResults);
}
