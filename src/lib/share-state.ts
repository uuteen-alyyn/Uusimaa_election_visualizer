/**
 * URL-hash share-state codec.
 *
 * Ported from `prototype/app.jsx:7-24`. Format: `#v=<base64-no-padding>`
 * of UTF-8-encoded JSON. Preserved verbatim so existing share-link
 * URLs from the prototype continue to round-trip in the new app.
 */

import type {
  Binding,
  ElectionId,
  FormulaToken,
  PartyId,
  WorkflowKind,
} from "../types/elections";

/** The subset of `AppState` that round-trips through the URL hash.
 *
 *  The prototype omits `formulaTokens` / `formulaBindings` when not in
 *  formula mode, to keep the hash short — same convention here. */
export interface ShareableState {
  mode: WorkflowKind;
  election: ElectionId;
  refElection: ElectionId;
  focusParty: PartyId | null;
  formulaTokens?: FormulaToken[];
  formulaBindings?: Record<string, Binding>;
}

/** UTF-8 → base64 (matches prototype's `btoa(unescape(encodeURIComponent(s)))`). */
function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** base64 → UTF-8 (matches prototype's `decodeURIComponent(escape(atob(b64)))`). */
function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encode state → base64 (no padding). Returns "" if the state can't
 *  be JSON-stringified for any reason. */
export function encodeShareState(s: ShareableState): string {
  try {
    return utf8ToBase64(JSON.stringify(s)).replace(/=+$/, "");
  } catch {
    return "";
  }
}

/** Decode a base64 share-link payload. Returns `null` for missing or
 *  malformed input — never throws. */
export function decodeShareState(b64: string): ShareableState | null {
  if (!b64) return null;
  try {
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = base64ToUtf8(pad);
    return JSON.parse(json) as ShareableState;
  } catch {
    return null;
  }
}

/** Extract a state from a URL hash string (e.g. `#v=…` or
 *  `#focus=foo&v=…`). Returns `null` if no `v=` segment is present. */
export function readShareStateFromHash(hash: string): ShareableState | null {
  const match = hash.match(/[#&]v=([^&]+)/);
  if (!match || !match[1]) return null;
  return decodeShareState(match[1]);
}

/** Build the hash fragment for `history.replaceState`, including the
 *  leading `#`. Returns `""` if encoding failed. */
export function writeShareStateToHash(s: ShareableState): string {
  const enc = encodeShareState(s);
  return enc ? "#v=" + enc : "";
}
