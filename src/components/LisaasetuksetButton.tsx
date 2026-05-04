/**
 * Lisäasetukset ("more settings") — small popover triggered by a
 * pill in the controls row. Hosts the lower-frequency toggles so
 * the controls row stays a single clean line:
 *   - Kunta / Hyvinvointialue (HVA) view toggle
 *   - "Älä huomioi Ahvenanmaata" — formula mode only, since that's
 *     where Ahvenanmaa's empty share collapses adaptive ramps.
 *
 * Click outside closes; Esc closes too. Implementation deliberately
 * avoids a portal — the popover sits in normal flow, anchored to
 * the trigger via a positioned wrapper.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  /** "kunta" | "hva" — current map grouping. */
  viewMode: "kunta" | "hva";
  onViewModeChange: (next: "kunta" | "hva") => void;
  /** Reason the HVA toggle is disabled (Helsinki / Ahvenanmaa). */
  hvaDisabledReason: string | null;
  /** Whether the formula-mode "Älä huomioi Ahvenanmaata" toggle
   *  is even relevant — only when the active mode is "formula". */
  showAhvenanmaaToggle: boolean;
  excludeAhvenanmaa: boolean;
  onExcludeAhvenanmaaChange: (next: boolean) => void;
}

export function LisaasetuksetButton({
  viewMode,
  onViewModeChange,
  hvaDisabledReason,
  showAhvenanmaaToggle,
  excludeAhvenanmaa,
  onExcludeAhvenanmaaChange,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Click-outside + Esc to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hvaDisabled = hvaDisabledReason !== null;

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span
        className="pill"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          cursor: "pointer",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ⚙ Lisäasetukset
      </span>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 30,
            background: "var(--paper)",
            border: "var(--border-default) solid var(--line)",
            borderRadius: "var(--radius-box)",
            boxShadow: "var(--shadow-pop)",
            padding: 12,
            minWidth: 280,
            fontFamily:
              "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <SettingsRow label="Kartan ryhmittely">
            <div
              style={{
                display: "inline-flex",
                gap: 4,
                background: "var(--paper-2)",
                border: "var(--border-thin) solid var(--line)",
                borderRadius: "var(--radius-pill)",
                padding: 3,
                opacity: hvaDisabled ? 0.5 : 1,
              }}
              title={hvaDisabledReason ?? ""}
            >
              {(["kunta", "hva"] as const).map((m) => (
                <span
                  key={m}
                  className={"pill " + (viewMode === m ? "on" : "")}
                  onClick={() => !hvaDisabled && onViewModeChange(m)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={viewMode === m}
                  style={{
                    cursor: hvaDisabled ? "not-allowed" : "pointer",
                    fontSize: 11,
                    padding: "2px 10px",
                  }}
                >
                  {m === "kunta" ? "Kunta" : "Hyvinvointialue"}
                </span>
              ))}
            </div>
            {hvaDisabledReason ? (
              <div style={hintStyle}>{hvaDisabledReason}</div>
            ) : null}
          </SettingsRow>

          {showAhvenanmaaToggle ? (
            <SettingsRow label="Mukautettu kaava">
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
                  onChange={(e) => onExcludeAhvenanmaaChange(e.target.checked)}
                  style={{ accentColor: "var(--ink)" }}
                />
                <span>Älä huomioi Ahvenanmaata</span>
              </label>
              <div style={hintStyle}>
                Ahvenanmaalla ei ole ääniä mantereen puolueille — sen
                mukaan ottaminen romahduttaa väriliukuman muille
                alueille.
              </div>
            </SettingsRow>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--ink)",
          opacity: 0.85,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink)",
  opacity: 0.7,
  marginTop: 6,
  fontStyle: "italic",
  lineHeight: 1.4,
};
