/**
 * Compact "↓ Lataa" dropdown — three export targets:
 *   - Map as SVG (vector, infinitely scalable)
 *   - Map as PNG (2× rasterised)
 *   - Whole dashboard as PNG (map + ledger + chrome via html-to-image)
 *
 * Ported from `prototype/wf-variants.jsx`'s `DownloadMenu`.
 */

import { useEffect, useState } from "react";

interface DownloadMenuProps {
  onMapSvg: () => void;
  onMapPng: () => void;
  onDashboardPng: () => void;
  /** Disable triggers while data is still loading. */
  disabled?: boolean;
}

export function DownloadMenu({
  onMapSvg,
  onMapPng,
  onDashboardPng,
  disabled = false,
}: DownloadMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const item = (label: string, kind: string, onPick: () => void): JSX.Element => (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setOpen(false);
        // Defer one tick so the click that closed the menu doesn't
        // bubble through into a fresh open via a parent handler.
        setTimeout(onPick, 0);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        fontSize: 12,
        cursor: "pointer",
        borderRadius: "var(--radius-chip)",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        className="mono"
        style={{ fontSize: 10, opacity: 0.6, width: 32 }}
        aria-hidden="true"
      >
        {kind}
      </span>
      <span>{label}</span>
    </div>
  );

  return (
    <span
      style={{ position: "relative", flexShrink: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        onClick={() => !disabled && setOpen((o) => !o)}
        title="Lataa kartta tai koko näkymä"
        className="pill"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 12,
          opacity: disabled ? 0.45 : 1,
          borderStyle: "solid",
          background: "var(--paper)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <span style={{ fontSize: 12, lineHeight: 1 }} aria-hidden="true">
          ↓
        </span>
        Lataa kuvana
      </span>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 25,
            minWidth: 200,
            padding: 6,
            background: "var(--paper)",
            border: "var(--border-default) solid var(--line)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <SectionLabel>Vain kartta</SectionLabel>
          {item("Kartta PNG-kuvana", "PNG", onMapPng)}
          {item("Kartta SVG-vektorina", "SVG", onMapSvg)}
          <div style={{ height: 1, background: "var(--hair)", margin: "4px 6px" }} />
          <SectionLabel>Koko näkymä</SectionLabel>
          {item("Näkymä PNG-kuvana", "PNG", onDashboardPng)}
        </div>
      ) : null}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        opacity: 0.6,
        padding: "4px 10px 2px",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {children}
    </div>
  );
}
