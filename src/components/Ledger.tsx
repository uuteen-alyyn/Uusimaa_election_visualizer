/**
 * Ledger panel — right column of the dashboard.
 *
 * Ported from the right-side block of `prototype/wf-variants.jsx`'s
 * V2_Focused (lines 736-870). Phase 3 (3/4) ships:
 *
 *   - Region label + type (Koko maa / Vaalipiiri / Kunta)
 *   - Big TOTAL VOTES number with Finnish thousand separators
 *   - Turnout + voters
 *   - Party-share bar list (8 canonical parties + an "other" bucket)
 *   - Loading / no-data states
 *
 * Phase 3 (4/4) adds the formula-value block (when mode === "formula").
 * Phase 4 adds the candidates list.
 */

import { PARTIES, PARTY_BY_ID } from "../data/catalog";
import {
  KNOWN_PARTY_IDS,
  type Candidate,
  type FormulaFraming,
  type RegionResult,
} from "../types/elections";

export type LedgerLevelLabel =
  | "Koko maa"
  | "Vaalipiiri"
  | "Kunta"
  | "Hyvinvointialue"
  | "Äänestysalue";

interface LedgerProps {
  /** Region result to display. `null` while loading or when no
   *  fixture has been resolved (e.g. ek2027 with no_data). */
  result: RegionResult | null;
  /** Friendly name for the region (heading). */
  label: string;
  /** Friendly type label shown above the heading. */
  levelLabel: LedgerLevelLabel;
  loading?: boolean;
  /** Formula value at this region (already framed). `null` when
   *  no formula is active or this region had no data. */
  formulaValue?: number | null;
  /** Pretty-printed formula expression (e.g. "Kok % (EK 2023) - Kok % (EK 2019)"). */
  formulaSummaryText?: string | null;
  /** Active framing — affects the unit label and sign on display. */
  framing?: FormulaFraming | null;
  /** Saver's free-text description of what the active custom
   *  formula computes. Shown beneath the value block when set. */
  formulaDescription?: string | null;
}

const NUM_FI = new Intl.NumberFormat("fi-FI");

export function Ledger({
  result,
  label,
  levelLabel,
  loading = false,
  formulaValue = null,
  formulaSummaryText = null,
  framing = null,
  formulaDescription = null,
}: LedgerProps): JSX.Element {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--paper)",
        border: "var(--border-default) solid var(--line)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-default)",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <Header label={label} levelLabel={levelLabel} result={result} loading={loading} />
      {formulaSummaryText ? (
        <FormulaValueBlock
          value={formulaValue}
          summaryText={formulaSummaryText}
          framing={framing}
          description={formulaDescription}
        />
      ) : null}
      <PartyShares result={result} loading={loading} />
      <CandidatesList result={result} loading={loading} />
    </aside>
  );
}

/* ─── Formula value block ──────────────────────────────────── */

function FormulaValueBlock({
  value,
  summaryText,
  framing,
  description,
}: {
  value: number | null;
  summaryText: string;
  framing: FormulaFraming | null;
  description: string | null;
}): JSX.Element {
  const isVotes = framing === "absVotes";
  const suffix =
    framing === "share" || framing === "vsSelected" ? "%" : "";
  const sign = framing === "vsSelected" && value != null && value > 0 ? "+" : "";
  const fmt = (v: number | null): string => {
    if (v === null || !Number.isFinite(v)) return "—";
    if (isVotes) {
      // Vote counts: integer with Finnish thousand separators.
      return new Intl.NumberFormat("fi-FI").format(Math.round(v));
    }
    const a = Math.abs(v);
    if (a >= 10_000) return `${(v / 1000).toFixed(1)}k${suffix}`;
    if (a >= 100) return `${sign}${v.toFixed(0)}${suffix}`;
    return `${sign}${v.toFixed(1)}${suffix}`;
  };
  const framingLabel =
    framing === "absVotes"
      ? "ääniä"
      : framing === "share"
        ? "% näkyvistä yhteensä"
        : framing === "vsSelected"
          ? "% kaavan viimeisestä termistä"
          : "prosenttiyksikköä";

  return (
    <div
      style={{
        padding: "12px 18px",
        borderBottom: "var(--border-default) dashed var(--hair)",
        background: "#faf3df",
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Kaavan arvo
      </div>
      <div
        style={{
          fontSize: 11,
          opacity: 0.75,
          fontFamily: "var(--font-mono)",
          marginBottom: 6,
          wordBreak: "break-word",
          lineHeight: 1.4,
        }}
      >
        ƒ {summaryText}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="h" style={{ fontSize: 36, lineHeight: 1 }}>
          {fmt(value)}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, fontStyle: "italic" }}>
          {framingLabel}
        </div>
      </div>
      {description ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px dotted var(--hair)",
            fontSize: 12,
            lineHeight: 1.5,
            opacity: 0.85,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          aria-label="Lisätietoja kaavasta"
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Header (level + title + big number + turnout) ─────────── */

function Header({
  label,
  levelLabel,
  result,
  loading,
}: {
  label: string;
  levelLabel: string;
  result: RegionResult | null;
  loading: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderBottom: "var(--border-default) dashed var(--hair)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          opacity: 0.6,
          textTransform: "uppercase",
        }}
      >
        {levelLabel}
      </div>
      <div
        className="h"
        style={{ fontSize: 28, lineHeight: 1.1, margin: "4px 0 14px" }}
      >
        {label}
      </div>

      {loading ? (
        <div style={{ fontStyle: "italic", opacity: 0.55, fontSize: 13 }}>
          Loading…
        </div>
      ) : result ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div className="h" style={{ fontSize: 48, lineHeight: 1 }}>
              {NUM_FI.format(result.votes)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>annettua ääntä</div>
          </div>
          <TurnoutLine result={result} />
        </>
      ) : (
        <div style={{ fontStyle: "italic", opacity: 0.55, fontSize: 13 }}>
          Ei tietoja
        </div>
      )}
    </div>
  );
}

function TurnoutLine({ result }: { result: RegionResult }): JSX.Element {
  // Turnout is currently 0 for every fixture row (Phase 1 deferred a
  // proper turnout fetch). When 0, render a tasteful "—" rather than
  // a misleading 0%.
  const hasTurnout = result.turnout > 0;
  return (
    <div
      style={{
        fontSize: 12,
        opacity: 0.7,
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <span>
        Äänestysprosentti ·{" "}
        <span className="mono">
          {hasTurnout ? `${result.turnout.toFixed(1)}%` : "—"}
        </span>
      </span>
      {result.voters > 0 ? (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            Äänioikeutettuja ·{" "}
            <span className="mono">{NUM_FI.format(result.voters)}</span>
          </span>
        </>
      ) : null}
    </div>
  );
}

/* ─── Party-share bars ──────────────────────────────────────── */

function PartyShares({
  result,
  loading,
}: {
  result: RegionResult | null;
  loading: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        padding: "12px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        Kannatus
      </div>
      {loading || !result ? (
        <PartyShareSkeleton />
      ) : (
        <PartyShareBars result={result} />
      )}
    </div>
  );
}

function PartyShareSkeleton(): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bar-row"
          style={{ gridTemplateColumns: "64px 1fr 42px 64px", gap: 8 }}
        >
          <span style={{ opacity: 0.3 }}>…</span>
          <span
            className="bar"
            style={{ borderStyle: "dashed", opacity: 0.4 }}
          />
          <span style={{ opacity: 0.3 }}>—</span>
          <span style={{ opacity: 0.3 }}>—</span>
        </div>
      ))}
    </div>
  );
}

function PartyShareBars({ result }: { result: RegionResult }): JSX.Element {
  // Sort by share desc; show all 8 canonical parties (insert 0%
  // if a party has no entry — keeps the row count stable as the
  // user navigates between regions). Sum non-canonical entries
  // into a single "Muut" row at the bottom.
  const knownRows = PARTIES.map((p) => ({
    party: p,
    share: result.shares[p.id] ?? 0,
  })).sort((a, b) => b.share - a.share);

  let otherSum = 0;
  for (const [pid, share] of Object.entries(result.shares)) {
    if (!KNOWN_PARTY_IDS.includes(pid as (typeof KNOWN_PARTY_IDS)[number])) {
      otherSum += share ?? 0;
    }
  }

  const allShares = [...knownRows.map((r) => r.share), otherSum];
  const maxShare = Math.max(0.0001, ...allShares);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {knownRows.map(({ party, share }) => (
        <ShareRow
          key={party.id}
          label={party.abbr}
          color={`var(--p-${party.id})`}
          share={share}
          totalVotes={result.votes}
          maxShare={maxShare}
        />
      ))}
      {otherSum > 0.05 ? (
        <ShareRow
          key="other"
          label="Muut"
          color="var(--ink-mute)"
          share={otherSum}
          totalVotes={result.votes}
          maxShare={maxShare}
          subdued
        />
      ) : null}
    </div>
  );
}

/* ─── Candidates list ───────────────────────────────────────── */

function CandidatesList({
  result,
  loading,
}: {
  result: RegionResult | null;
  loading: boolean;
}): JSX.Element | null {
  if (loading) return null;
  const cands = result?.candidates ?? [];
  if (cands.length === 0) return null;

  return (
    <div
      style={{
        padding: "12px 18px",
        borderTop: "var(--border-default) dashed var(--hair)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        Eniten ääniä saaneet ehdokkaat
      </div>
      <div
        role="list"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          maxHeight: 280,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {cands.map((c, i) => (
          <CandidateRow key={c.id} rank={i + 1} candidate={c} />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({
  rank,
  candidate,
}: {
  rank: number;
  candidate: Candidate;
}): JSX.Element {
  const known = PARTY_BY_ID[candidate.party];
  const partyLabel = known?.abbr ?? candidate.party.replace(/^_/, "").toUpperCase();
  const swatchColor = known ? `var(--p-${known.id})` : "var(--ink-mute)";
  return (
    <div
      role="listitem"
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr auto",
        gap: 8,
        alignItems: "center",
        fontSize: 12,
        padding: "2px 0",
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 10, opacity: 0.55, textAlign: "right" }}
      >
        {rank}.
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          className="swatch"
          style={{ background: swatchColor, flexShrink: 0 }}
          aria-hidden="true"
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={`${candidate.name} (${partyLabel})`}
        >
          {candidate.name}{" "}
          <span style={{ opacity: 0.55, fontSize: 11 }}>· {partyLabel}</span>
        </span>
      </span>
      <span className="mono" style={{ fontSize: 11, textAlign: "right" }}>
        {NUM_FI.format(candidate.votes)}
      </span>
    </div>
  );
}

function ShareRow({
  label,
  color,
  share,
  totalVotes,
  maxShare,
  subdued = false,
}: {
  label: string;
  color: string;
  share: number;
  totalVotes: number;
  maxShare: number;
  subdued?: boolean;
}): JSX.Element {
  const partyVotes = Math.round((totalVotes * share) / 100);
  const widthPct = (share / maxShare) * 100;
  return (
    <div
      className="bar-row"
      style={{
        gridTemplateColumns: "64px 1fr 42px 64px",
        gap: 8,
        opacity: subdued ? 0.7 : 1,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
        <span className="swatch" style={{ background: color }} />
        {label}
      </span>
      <span className="bar">
        <span style={{ width: `${widthPct}%`, background: color, display: "block", height: "100%" }} />
      </span>
      <span className="mono" style={{ fontSize: 11, textAlign: "right" }}>
        {share.toFixed(1)}%
      </span>
      <span
        className="mono"
        style={{ fontSize: 11, textAlign: "right", opacity: 0.7 }}
      >
        {partyVotes > 0 ? new Intl.NumberFormat("fi-FI").format(partyVotes) : "—"}
      </span>
    </div>
  );
}
