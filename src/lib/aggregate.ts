/**
 * Aggregate multiple `RegionResult`s into one (e.g. country totals
 * computed from the 13 vp rows). Used by the ledger when no region
 * is selected at country level — the prototype called
 * `regionData("suomi")` for synthetic data; here we compute it
 * from real underlying rows.
 */

import type { ElectionId, PartyId, RegionResult } from "../types/elections";

/** Sum votes / voters and weighted-average party shares across rows.
 *
 *  Party share at the aggregate is `Σ(region.votes × region.share) / Σ(votes)`,
 *  which is the correct weighted mean (a simple arithmetic mean of
 *  per-region shares would over-weight low-population regions). */
export function aggregateRegions(
  rows: RegionResult[],
  options: { regionId: string; electionId: ElectionId },
): RegionResult {
  if (rows.length === 0) {
    return {
      regionId: options.regionId,
      electionId: options.electionId,
      votes: 0,
      voters: 0,
      turnout: 0,
      shares: {},
    };
  }

  let totalVotes = 0;
  let totalVoters = 0;
  const partyVotes: Partial<Record<PartyId, number>> = {};

  for (const r of rows) {
    totalVotes += r.votes;
    totalVoters += r.voters;
    for (const [party, share] of Object.entries(r.shares)) {
      if (share == null) continue;
      const v = (r.votes * share) / 100;
      partyVotes[party] = (partyVotes[party] ?? 0) + v;
    }
  }

  const shares: Partial<Record<PartyId, number>> = {};
  if (totalVotes > 0) {
    for (const [party, v] of Object.entries(partyVotes)) {
      if (v != null) shares[party] = (v / totalVotes) * 100;
    }
  }

  const turnout = totalVoters > 0 ? (totalVotes / totalVoters) * 100 : 0;

  return {
    regionId: options.regionId,
    electionId: options.electionId,
    votes: totalVotes,
    voters: totalVoters,
    turnout,
    shares,
  };
}
