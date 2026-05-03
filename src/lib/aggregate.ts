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

  // Merge candidate lists across the source rows. Candidates are
  // unique by id (assuming the same id space across vp/kunta — which
  // is true for parliamentary/municipal: the kuntakoodi varies, the
  // candidate id stays). Sum votes, then take top 40.
  const candAgg = new Map<string, { id: string; name: string; party: PartyId; votes: number }>();
  for (const r of rows) {
    if (!r.candidates) continue;
    for (const c of r.candidates) {
      const existing = candAgg.get(c.id);
      if (existing) existing.votes += c.votes;
      else candAgg.set(c.id, { ...c });
    }
  }
  const candidates = Array.from(candAgg.values())
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 90);

  const result: RegionResult = {
    regionId: options.regionId,
    electionId: options.electionId,
    votes: totalVotes,
    voters: totalVoters,
    turnout,
    shares,
  };
  if (candidates.length > 0) result.candidates = candidates;
  return result;
}
