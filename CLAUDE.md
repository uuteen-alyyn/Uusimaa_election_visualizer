# Instructions for Claude Code

Read in this order:
1. `README.md` — overview, fidelity, scope, design tokens, file map
2. `PRODUCT_NOTES.md` — design intent and edge cases that aren't in code
3. `prototype/Wireframes.html` — entry point + design tokens
4. `prototype/wf-variants.jsx` — the main dashboard component (`V2_Focused`)
5. `prototype/app.jsx` — state shape, URL sync, workflow apply/save
6. `prototype/wf-workflows.jsx` — election catalog, workflow built-ins
7. `prototype/wf-suggest.jsx` — formula chip composer
8. `prototype/wf-map.jsx` — map renderer + color ramps + formula evaluator
9. `prototype/wf-geo.jsx` — projection of real geometry to SVG paths
10. `screenshots/` — visual reference

## Then plan

Before writing code, produce a brief implementation plan covering:
- chosen stack + reasoning
- folder structure
- the data layer (`ElectionDataSource`) abstraction and a Tilastokeskus
  PxWeb adapter
- migration plan for the formula evaluator (it's pure JS today; port to TS)
- design-system primitives to extract (Pill, Chip, Box, Crumb, …)
- what to ship in v1 vs defer (see "Out of scope" in README)

## Stick to the visual style

Hi-fi means hi-fi: paper background, ink lines, Caveat headings,
Architects Daughter body, hand-drawn pill chrome. The map's polygons
themselves are clean vectors — that contrast (sketchy chrome around a
clean map) is intentional.

## Don't ship synthetic data

`regionData()` in the prototype is fully synthetic. The first real-data
milestone is rendering eduskuntavaalit 2023 winners across all 13
vaalipiirit from PxWeb, then kunnat-level for one vaalipiiri.

## License attribution is required

Footer must credit Tilastokeskus (CC BY 4.0) for both election data and
boundary geometry.
