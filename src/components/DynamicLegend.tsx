/**
 * DynamicLegend — per-mode legend explaining what the map's
 * colors mean. Ported from `prototype/wf-pieces.jsx`'s
 * DynamicLegend, but driven by the same adaptive ranges the
 * map uses (so the labels match what's on screen).
 *
 * Layout: small box, designed to be absolute-positioned at the
 * bottom-left of the map area.
 *
 *   - winner   → row of party swatches that actually win regions
 *                in the current view, plus an "Ei tietoja" chip
 *                when any region uses the crosshatch pattern
 *   - support  → cream→blue gradient bar, focus-party label,
 *                min/max % from the visible region range
 *   - votes    → cream→ochre gradient bar, fixed thresholds
 *                (20K / 50K / 100K / 200K)
 *   - change   → diverging gradient with min / 0 / max labels
 *                in percentage points
 *   - formula  → diverging-or-single-hue gradient with the
 *                framed range and a one-line ƒ-summary
 */

import { PARTY_BY_ID } from "../data/catalog";
import type {
  FormulaFraming,
  PartyId,
  WorkflowKind,
} from "../types/elections";

interface Range {
  min: number;
  max: number;
}

interface DynamicLegendProps {
  mode: WorkflowKind;
  focusParty: PartyId | null;
  /** Unique winner-party set across visible regions. Required for
   *  winner mode; ignored otherwise. */
  winnerParties?: PartyId[];
  /** Whether at least one visible region uses the no-data crosshatch.
   *  When true, an "Ei tietoja" chip is appended. */
  hasNoData?: boolean;
  supportRange?: Range | null;
  changeRange?: Range | null;
  votesRange?: Range | null;
  formulaRange?: Range | null;
  /** Pretty-printed formula summary (e.g. "Kok % (EK 2023) - …"). */
  formulaSummary?: string | null;
  framing?: FormulaFraming | null;
  /** Current election's short label (e.g. "EK 2023"). */
  electionLabel?: string;
  /** Reference election's short label, change mode only. */
  refElectionLabel?: string;
}

export function DynamicLegend(props: DynamicLegendProps): JSX.Element {
  return (
    <div
      className="box soft"
      style={{
        padding: "10px 12px",
        minWidth: 220,
        maxWidth: 320,
        boxShadow: "var(--shadow-default)",
      }}
      aria-label="Värin merkitys"
    >
      <Body {...props} />
    </div>
  );
}

function Body(props: DynamicLegendProps): JSX.Element {
  switch (props.mode) {
    case "winner":
      return <WinnerBody parties={props.winnerParties ?? []} hasNoData={props.hasNoData ?? false} />;
    case "support":
      return (
        <SupportBody
          focusParty={props.focusParty}
          range={props.supportRange ?? null}
          electionLabel={props.electionLabel}
        />
      );
    case "votes":
      return (
        <VotesBody
          focusParty={props.focusParty}
          range={props.votesRange ?? null}
          electionLabel={props.electionLabel}
        />
      );
    case "change":
      return (
        <ChangeBody
          focusParty={props.focusParty}
          range={props.changeRange ?? null}
          electionLabel={props.electionLabel}
          refElectionLabel={props.refElectionLabel}
        />
      );
    case "formula":
      return (
        <FormulaBody
          range={props.formulaRange ?? null}
          framing={props.framing ?? "absolute"}
          summary={props.formulaSummary ?? null}
        />
      );
  }
}

/* ─── Winner ─────────────────────────────────────────────────── */

function WinnerBody({
  parties,
  hasNoData,
}: {
  parties: PartyId[];
  hasNoData: boolean;
}): JSX.Element {
  return (
    <>
      <Caption>Suurin puolue</Caption>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
        }}
      >
        {parties.length === 0 ? (
          <span style={{ opacity: 0.55, fontStyle: "italic" }}>Ei tuloksia</span>
        ) : null}
        {parties.map((p) => (
          <span
            key={p}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              className="swatch"
              style={{ background: `var(--p-${p})`, borderColor: `var(--p-${p})` }}
              aria-hidden="true"
            />
            {PARTY_BY_ID[p]?.name ?? p}
          </span>
        ))}
        {hasNoData ? <NoDataRow /> : null}
      </div>
    </>
  );
}

function NoDataRow(): JSX.Element {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        opacity: 0.7,
        marginTop: 2,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 16,
          height: 12,
          borderRadius: 2,
          border: "1px solid rgba(0,0,0,0.3)",
          background:
            "repeating-linear-gradient(45deg, #e6e0cf 0 5px, #c9c1ac 5px 6px)",
        }}
      />
      Ei tietoja
    </span>
  );
}

/* ─── Support ────────────────────────────────────────────────── */

function SupportBody({
  focusParty,
  range,
  electionLabel,
}: {
  focusParty: PartyId | null;
  range: Range | null;
  electionLabel: string | undefined;
}): JSX.Element {
  const partyName = focusParty
    ? PARTY_BY_ID[focusParty]?.name ?? focusParty
    : "puolue";
  return (
    <>
      <Caption>{partyName} kannatus % {electionLabel ? `· ${electionLabel}` : ""}</Caption>
      <SingleHueBar />
      <RangeLabels
        left={range ? `${range.min.toFixed(1)}%` : "0%"}
        right={range ? `${range.max.toFixed(1)}%` : "—"}
      />
    </>
  );
}

/* ─── Votes ──────────────────────────────────────────────────── */

function VotesBody({
  focusParty,
  range,
  electionLabel,
}: {
  focusParty: PartyId | null;
  range: Range | null;
  electionLabel: string | undefined;
}): JSX.Element {
  const partyName = focusParty
    ? PARTY_BY_ID[focusParty]?.name ?? focusParty
    : null;
  const caption = partyName
    ? `${partyName} äänimäärä${electionLabel ? ` · ${electionLabel}` : ""}`
    : `Annettu äänimäärä${electionLabel ? ` · ${electionLabel}` : ""}`;
  return (
    <>
      <Caption>{caption}</Caption>
      <div
        style={{
          height: 10,
          border: "1px solid var(--line)",
          borderRadius: 2,
          background:
            "linear-gradient(90deg, var(--ramp-votes-1), var(--ramp-votes-2), var(--ramp-votes-3), var(--ramp-votes-4), var(--ramp-votes-5))",
        }}
        aria-hidden="true"
      />
      {range ? (
        <BoldRangeLabels
          left={formatVotesFull(range.min)}
          right={formatVotesFull(range.max)}
          caption={focusParty ? "ääniä näkyvällä alueella" : "annettuja ääniä"}
        />
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          <span>0</span>
          <span>20k</span>
          <span>50k</span>
          <span>100k</span>
          <span>200k+</span>
        </div>
      )}
    </>
  );
}

/** Range labels under the bar: bigger + a tiny caption underneath
 *  so the absolute scale is impossible to miss. The user can see
 *  at a glance that a saturated cell on the KOK map (148k ääntä)
 *  isn't equivalent to a saturated cell on the KD map (22k ääntä). */
function BoldRangeLabels({
  left,
  right,
  caption,
}: {
  left: string;
  right: string;
  caption: string;
}): JSX.Element {
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          marginTop: 6,
        }}
      >
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div
        style={{
          fontSize: 10,
          opacity: 0.55,
          fontStyle: "italic",
          textAlign: "center",
          marginTop: 2,
        }}
      >
        {caption}
      </div>
    </>
  );
}

const NUM_FI_LEGEND = new Intl.NumberFormat("fi-FI");

/** Full Finnish-formatted vote count — "148 110" not "148k". */
function formatVotesFull(v: number): string {
  return NUM_FI_LEGEND.format(Math.round(v));
}


/* ─── Change (diverging) ────────────────────────────────────── */

function ChangeBody({
  focusParty,
  range,
  electionLabel,
  refElectionLabel,
}: {
  focusParty: PartyId | null;
  range: Range | null;
  electionLabel: string | undefined;
  refElectionLabel: string | undefined;
}): JSX.Element {
  const partyName = focusParty
    ? PARTY_BY_ID[focusParty]?.name ?? focusParty
    : "puolue";
  const subtitle =
    refElectionLabel && electionLabel
      ? `${refElectionLabel} → ${electionLabel}`
      : "";
  return (
    <>
      <Caption>
        {partyName} kannatuksen muutos{subtitle ? ` · ${subtitle}` : ""}
      </Caption>
      <DivergingBar />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          opacity: 0.7,
          marginTop: 4,
        }}
      >
        <span>{range ? `${range.min.toFixed(1)} pp` : "−"}</span>
        <span>0</span>
        <span>{range ? `+${range.max.toFixed(1)} pp` : "+"}</span>
      </div>
    </>
  );
}

/* ─── Formula ────────────────────────────────────────────────── */

function FormulaBody({
  range,
  framing,
  summary,
}: {
  range: Range | null;
  framing: FormulaFraming;
  summary: string | null;
}): JSX.Element {
  const isDiverging = range != null && range.min < 0 && range.max > 0;
  const unit =
    framing === "absVotes"
      ? ""
      : framing === "share" || framing === "vsSelected"
        ? "%"
        : "";
  return (
    <>
      <Caption>
        Mukautettu kaava
        {framing === "absVotes"
          ? " · äänimäärä"
          : framing === "share"
            ? " · % näkyvistä"
            : framing === "vsSelected"
              ? " · suht. muutos %"
              : " · prosenttiyksikköä"}
      </Caption>
      {summary ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            opacity: 0.75,
            marginBottom: 6,
            wordBreak: "break-word",
          }}
        >
          ƒ {summary}
        </div>
      ) : null}
      {isDiverging ? <DivergingBar /> : <SingleHueBar />}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          opacity: 0.7,
          marginTop: 4,
        }}
      >
        <span>
          {range != null
            ? `${formatScalar(range.min)}${unit}`
            : "−"}
        </span>
        {isDiverging ? <span>0</span> : null}
        <span>
          {range != null
            ? `${range.max > 0 && isDiverging ? "+" : ""}${formatScalar(range.max)}${unit}`
            : "+"}
        </span>
      </div>
    </>
  );
}

function formatScalar(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 10_000) return (v / 1000).toFixed(1) + "k";
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(1);
}

/* ─── Shared bits ────────────────────────────────────────────── */

function Caption({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 11,
        opacity: 0.6,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function SingleHueBar(): JSX.Element {
  return (
    <div
      style={{
        height: 10,
        border: "1px solid var(--line)",
        borderRadius: 2,
        background:
          "linear-gradient(90deg, var(--ramp-support-1), var(--ramp-support-3), var(--ramp-support-6))",
      }}
      aria-hidden="true"
    />
  );
}

function DivergingBar(): JSX.Element {
  return (
    <div
      style={{
        height: 10,
        border: "1px solid var(--line)",
        borderRadius: 2,
        background:
          "linear-gradient(90deg, var(--ramp-change-1), var(--ramp-change-3) 50%, var(--ramp-change-5))",
      }}
      aria-hidden="true"
    />
  );
}

function RangeLabels({
  left,
  right,
}: {
  left: string;
  right: string;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        opacity: 0.7,
        marginTop: 4,
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
