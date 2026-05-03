/**
 * Breadcrumb navigation — port of `prototype/wf-pieces.jsx`'s Crumb,
 * trimmed to the two levels we actually use (country + drilled-in vp).
 *
 * Phase 4 will extend this if/when we add a third level (kunta drill
 * from a kunta's ledger), but for now country → vp is the whole
 * navigation tree.
 */

interface CrumbProps {
  /** Label for the home pill (always shown). */
  home: string;
  /** When set, the drilled-in level's label is rendered as the
   *  current heading. When null, the home pill is the current level. */
  current?: string | null;
  /** Click on the home pill — drill up to the country view. */
  onHome: () => void;
}

export function Crumb({ home, current, onHome }: CrumbProps): JSX.Element {
  const homeIsActive = !current;
  return (
    <nav className="crumb" aria-label="Sijainti">
      <span
        className={"pill" + (homeIsActive ? " on" : "")}
        style={{ cursor: "pointer", boxShadow: "var(--shadow-soft)" }}
        onClick={onHome}
        role="button"
        tabIndex={0}
        aria-label={current ? `Palaa ${home} -näkymään` : `${home} (nykyinen)`}
        aria-current={homeIsActive ? "location" : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onHome();
          }
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.8 }} aria-hidden="true">
          ⌂
        </span>
        {home}
      </span>
      {current ? (
        <>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <span
            className="h"
            style={{ fontSize: 18, fontWeight: 700 }}
            aria-current="location"
          >
            {current}
          </span>
        </>
      ) : null}
    </nav>
  );
}
