/**
 * Catalog of supported elections, election types, and parties.
 *
 * Ported from `prototype/wf-workflows.jsx:29` so existing share-link
 * URLs (which encode election ids like "ek2023") keep working.
 *
 * Scope: every election in the prototype's catalog. Includes future
 * elections (e.g. ek2027) — the build-time prefetch script writes a
 * `{ status: "no_data" }` placeholder for those, and the UI renders
 * the corresponding `.nodata` crosshatch.
 */

import type {
  ElectionId,
  ElectionTypeId,
  PartyId,
} from "../types/elections";

/* ─── Election types ───────────────────────────────────────── */

export interface ElectionType {
  id: ElectionTypeId;
  /** Full Finnish label, used in dropdowns. */
  label: string;
  /** Short label, used in formula chips and legends. */
  short: string;
}

export const ELECTION_TYPES: readonly ElectionType[] = [
  { id: "kunta", label: "Kuntavaalit", short: "Kunta" },
  { id: "alue", label: "Aluevaalit", short: "Alue" },
  { id: "ek", label: "Eduskuntavaalit", short: "EK" },
  { id: "eu", label: "Eurovaalit", short: "EU" },
  { id: "pres", label: "Presidentinvaalit", short: "Pres" },
];

export const ELECTION_TYPE_BY_ID: Readonly<
  Record<ElectionTypeId, ElectionType>
> = Object.fromEntries(ELECTION_TYPES.map((t) => [t.id, t])) as Readonly<
  Record<ElectionTypeId, ElectionType>
>;

/* ─── Elections ─────────────────────────────────────────────── */

export interface ElectionDef {
  id: ElectionId;
  typeId: ElectionTypeId;
  year: number;
  /** 1 or 2 for presidential elections; undefined otherwise. */
  round?: 1 | 2;
  /** Full Finnish label, used in dropdowns. */
  label: string;
  /** Short label, used in legends and formula chips. */
  shortLabel: string;
}

export const ELECTIONS: readonly ElectionDef[] = [
  // Parliamentary — newest first
  {
    id: "ek2027",
    typeId: "ek",
    year: 2027,
    label: "Eduskuntavaalit 2027",
    shortLabel: "EK 2027",
  },
  {
    id: "ek2023",
    typeId: "ek",
    year: 2023,
    label: "Eduskuntavaalit 2023",
    shortLabel: "EK 2023",
  },
  {
    id: "ek2019",
    typeId: "ek",
    year: 2019,
    label: "Eduskuntavaalit 2019",
    shortLabel: "EK 2019",
  },
  // Municipal
  {
    id: "kunta2025",
    typeId: "kunta",
    year: 2025,
    label: "Kuntavaalit 2025",
    shortLabel: "Kunta 2025",
  },
  {
    id: "kunta2021",
    typeId: "kunta",
    year: 2021,
    label: "Kuntavaalit 2021",
    shortLabel: "Kunta 2021",
  },
  // Regional / wellbeing services counties
  {
    id: "alue2025",
    typeId: "alue",
    year: 2025,
    label: "Aluevaalit 2025",
    shortLabel: "Alue 2025",
  },
  {
    id: "alue2022",
    typeId: "alue",
    year: 2022,
    label: "Aluevaalit 2022",
    shortLabel: "Alue 2022",
  },
  // European
  {
    id: "eu2024",
    typeId: "eu",
    year: 2024,
    label: "Eurovaalit 2024",
    shortLabel: "EU 2024",
  },
  {
    id: "eu2019",
    typeId: "eu",
    year: 2019,
    label: "Eurovaalit 2019",
    shortLabel: "EU 2019",
  },
  // Presidential — rounds as separate entries
  {
    id: "pres2024r1",
    typeId: "pres",
    year: 2024,
    round: 1,
    label: "Presidentinvaalit 2024 · 1. kierros",
    shortLabel: "Pres 2024 · I",
  },
  {
    id: "pres2024r2",
    typeId: "pres",
    year: 2024,
    round: 2,
    label: "Presidentinvaalit 2024 · 2. kierros",
    shortLabel: "Pres 2024 · II",
  },
  {
    id: "pres2018r1",
    typeId: "pres",
    year: 2018,
    round: 1,
    label: "Presidentinvaalit 2018 · 1. kierros",
    shortLabel: "Pres 2018 · I",
  },
  // 2018 was decided in round 1; no round 2.
  {
    id: "pres2012r1",
    typeId: "pres",
    year: 2012,
    round: 1,
    label: "Presidentinvaalit 2012 · 1. kierros",
    shortLabel: "Pres 2012 · I",
  },
  {
    id: "pres2012r2",
    typeId: "pres",
    year: 2012,
    round: 2,
    label: "Presidentinvaalit 2012 · 2. kierros",
    shortLabel: "Pres 2012 · II",
  },
];

export const ELECTION_BY_ID: Readonly<Record<ElectionId, ElectionDef>> =
  Object.fromEntries(ELECTIONS.map((e) => [e.id, e])) as Readonly<
    Record<ElectionId, ElectionDef>
  >;

/** Elections of a given type, in catalog order (newest first). */
export function electionsOfType(typeId: ElectionTypeId): ElectionDef[] {
  return ELECTIONS.filter((e) => e.typeId === typeId);
}

/** Default (= newest) election for a given type, or null if none. */
export function defaultElectionForType(typeId: ElectionTypeId): ElectionId | null {
  return electionsOfType(typeId)[0]?.id ?? null;
}

/* ─── Parties ───────────────────────────────────────────────── */

export interface Party {
  id: PartyId;
  /** Full Finnish name. */
  name: string;
  /** Short abbreviation used in chips, tables, and the legend. */
  abbr: string;
}

export const PARTIES: readonly Party[] = [
  { id: "kok", name: "Kokoomus", abbr: "Kok" },
  { id: "sdp", name: "SDP", abbr: "SDP" },
  { id: "ps", name: "Perussuomalaiset", abbr: "PS" },
  { id: "kesk", name: "Keskusta", abbr: "Kesk" },
  { id: "vihr", name: "Vihreät", abbr: "Vihr" },
  { id: "vas", name: "Vasemmistoliitto", abbr: "Vas" },
  { id: "rkp", name: "RKP", abbr: "RKP" },
  { id: "kd", name: "KD", abbr: "KD" },
];

export const PARTY_BY_ID: Readonly<Record<PartyId, Party>> = Object.fromEntries(
  PARTIES.map((p) => [p.id, p]),
) as Readonly<Record<PartyId, Party>>;
