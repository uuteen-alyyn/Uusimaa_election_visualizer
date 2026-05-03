/**
 * Share-link pill — copies `window.location.href` to the clipboard
 * and shows a brief "Linkki kopioitu" toast. The URL hash already
 * carries the full view state (mode / election / focusParty /
 * formula tokens / bindings) via `share-state.ts`, so a copied
 * link round-trips exactly.
 */

import { useState } from "react";

interface ShareLinkPillProps {
  /** Optional toast surface — caller renders the toast wherever
   *  it likes. When null, just no toast (still copies). */
  onToast?: (message: string) => void;
}

export function ShareLinkPill({ onToast }: ShareLinkPillProps): JSX.Element {
  const [pulse, setPulse] = useState(false);

  const copyLink = async (): Promise<void> => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        onToast?.("Linkki kopioitu");
      } else {
        onToast?.("Kopiointi epäonnistui — kopioi osoiterivistä");
      }
    } catch {
      onToast?.("Kopiointi epäonnistui — kopioi osoiterivistä");
    }
    setPulse(true);
    window.setTimeout(() => setPulse(false), 350);
  };

  return (
    <span
      onClick={() => void copyLink()}
      title="Kopioi linkki, joka palauttaa tämän näkymän"
      className="pill"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void copyLink();
        }
      }}
      style={{
        cursor: "pointer",
        fontSize: 11,
        opacity: 0.8,
        borderStyle: "dotted",
        background: "transparent",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        transform: pulse ? "scale(0.97)" : undefined,
        transition: "transform 120ms",
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1 }} aria-hidden="true">
        ↗
      </span>
      Jaa linkki
    </span>
  );
}
