/**
 * Breadcrumb navigation — port of `prototype/wf-pieces.jsx`'s Crumb,
 * trimmed to the two levels we actually use (country + drilled-in vp).
 *
 * Phase 4 will extend this if/when we add a third level (kunta drill
 * from a kunta's ledger), but for now country → vp is the whole
 * navigation tree.
 */

/** A single step in the breadcrumb. The last step (current
 *  location) should omit `onClick`. */
export interface CrumbStep {
  label: string;
  /** When set, the step renders as a clickable pill. When omitted,
   *  it renders as the current-location heading. */
  onClick?: () => void;
}

interface CrumbProps {
  steps: CrumbStep[];
}

export function Crumb({ steps }: CrumbProps): JSX.Element {
  return (
    <nav className="crumb" aria-label="Sijainti">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isHome = i === 0;
        const isClickable = !isLast && step.onClick != null;
        return (
          <Step
            key={i}
            label={step.label}
            isLast={isLast}
            isHome={isHome}
            onClick={step.onClick}
            showSep={i > 0}
            isClickable={isClickable}
          />
        );
      })}
    </nav>
  );
}

function Step({
  label,
  isLast,
  isHome,
  onClick,
  showSep,
  isClickable,
}: {
  label: string;
  isLast: boolean;
  isHome: boolean;
  onClick?: () => void;
  showSep: boolean;
  isClickable: boolean;
}): JSX.Element {
  const sep = showSep ? (
    <span className="sep" aria-hidden="true">
      ›
    </span>
  ) : null;

  if (isLast) {
    return (
      <>
        {sep}
        <span
          className="h"
          style={{ fontSize: 18, fontWeight: 700 }}
          aria-current="location"
        >
          {label}
        </span>
      </>
    );
  }

  // Render as clickable pill. Home gets the ⌂ glyph.
  return (
    <>
      {sep}
      <span
        className="pill"
        style={{
          cursor: isClickable ? "pointer" : "default",
          boxShadow: "var(--shadow-soft)",
          opacity: isClickable ? 1 : 0.8,
        }}
        onClick={isClickable ? onClick : undefined}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={
          isClickable ? `Palaa ${label}-näkymään` : label
        }
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
      >
        {isHome ? (
          <span style={{ fontSize: 12, opacity: 0.8 }} aria-hidden="true">
            ⌂
          </span>
        ) : null}
        {label}
      </span>
    </>
  );
}
