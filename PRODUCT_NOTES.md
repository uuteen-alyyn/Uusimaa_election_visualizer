# Product notes — chat-derived context

These notes capture the design intent that came out of the conversation,
beyond what's strictly in the prototype code.

## What the product does

A map-first explorer for Finnish election results. The user picks a
coloring "workflow" and an election, and the map of Finland (or a drilled-in
slice of it) is colored accordingly. The user can:

- drill from country → vaalipiiri → kunta hierarchically
- pick from common built-in workflows (winner / support % / votes / change)
- build their own coloring formula from chips and operators
- bind variable slots in formulas so one formula works across elections
- save custom workflows as new pill buttons
- copy a shareable URL that reproduces the exact view
- export the map / dashboard as PNG or SVG

It is **not** a real-time results service. It's an analytic / journalistic
tool against published, settled results.

## Hierarchy & geometry

- **Country (maa)** view shows all 13 vaalipiirit (constituencies)
- **Vaalipiiri (vp)** view shows all kunnat (municipalities) of one vp
- **Kunta** view shows äänestysalueet (polling districts) — *placeholder
  in the prototype*; treat as optional for v1

Real geometry comes from Tilastokeskus' open WFS layers (CC BY 4.0). The
prototype uses the **2026** snapshot — vaalipiirit only change in election
years, kunnat changes are minor year-to-year. Pick the snapshot that
matches each election when fetching data; for current map display,
2026 is fine.

Important: **Vaasa kunta (905)** is on islands and falls just outside its
parent vaalipiiri's polygon — we assigned it to Vaasan vaalipiiri by
nearest-neighbour. Document this in the data ingestion code.

## Coloring workflows

Built-in:
- **Biggest party (winner):** fill with the winner's party color
- **Party support %:** single-hue ramp of `<party>` % share
- **Total votes:** single-hue ramp of total votes cast
- **Change in support:** diverging purple↔orange ramp of
  `<party>%(this election) − <party>%(reference election)`

Custom (formula): user composes any expression from chips and `+ − × ÷ ( )`
plus numeric literals. The map auto-picks a diverging or single-hue ramp
based on whether the value range straddles zero.

A "framing" mode lets the user reinterpret the formula values:
- absolute (raw)
- share — each region's value as % of the visible total
- vsSelected — % difference vs. the currently selected region

## Formula chip composer

Each chip has three editable slots:
1. **Election type** — kunta / alue / ek / eu / pres
2. **Year** (and round, for pres) — newest-first list
3. **Who** — a party (KOK / SDP / PS / KESK / VIHR / VAS / RKP / KD) OR a
   specific candidate

Any slot can be a **selector** (`$A`, `$B`, `$C`) that gets bound at view
time from a small picker in the ledger. Selectors are how "compare 2023 vs
2027" formulas get reused with different year pairs without re-editing.

## Sharing

URL fragment encodes the entire view as base64 JSON. Keep this — it's a
core value-prop for journalists embedding views in articles.

```
https://app.example.com/#v=eyJtb2RlIjoid2lubmVyIiwiZWxlY3Rpb24iOiJlazIwMjcifQ
```

## Persistence

- `localStorage` `vk_workflows_v1` — array of saved custom workflows
- URL hash — current view state

## Empty / loading / error states (need to be designed in production)

The prototype skips these. For v1:
- **Loading:** sketchy "loading" stamp on the map area; party-share rows
  show as dashed placeholders
- **No data for a region/election combination:** crosshatch fill (already
  defined as `.nodata` in the prototype CSS), tooltip "Ei tietoja"
- **PxWeb API error:** retry button + cached fallback; degrade gracefully
- **Invalid formula:** inline error in the builder, map keeps last valid
  coloring

## Accessibility (required for v1)

- All interactive elements keyboard-reachable; Tab cycles map regions
- Color is never the sole signal — every map state has a label / value
  in the ledger
- Min text size 12px on screen (prototype is more relaxed; tighten in prod)
- Color ramps used are colorblind-safe diverging (purple↔orange)
- Region tooltips on focus, not just hover

## Internationalisation

UI strings are mixed FI/EN in the prototype. For production, externalise
into a string table; ship FI as default, SV as a near-must-have (Finland's
second official language), EN as nice-to-have. Election names, party
abbreviations, and kunta names are FI in PxWeb but SV equivalents are
available in the same tables.

## Attribution

Required by source licenses:
- "Lähde: Tilastokeskus, vaalitilastot (CC BY 4.0)"
- Geometry: "Tilastointialueet © Tilastokeskus, CC BY 4.0"

Show in footer.
