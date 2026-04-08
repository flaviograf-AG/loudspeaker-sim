# CLAUDE.md — Loudspeaker Simulator

## Project Overview
Browser-based loudspeaker enclosure + crossover simulator. Combines Hornresp (enclosure modeling) and XSim (crossover design) functionality in a single web app. Live at **https://ls.graf.me.uk**.

## Architecture
- `solver/` — Rust crate compiled to WASM (wasm-pack). 16 modules, 100 tests. Also builds as a CLI binary.
- `web/` — React 19 + Vite + TypeScript frontend. ECharts for plots, GDS for styling.
- Static deploy to ls.graf.me.uk (OVH VPS, Nginx, Cloudflare proxy). Zero server dependencies.
- WASM API: `simulate(json)` for single-driver, `simulate_system(json)` for multi-way, `optimize_system(json)` for crossover optimization.

### State Management (v2)
- **Single source of truth:** `DesignState` in `types/index.ts` — topology, ways, crossover points, per-way EQ, freq range
- **`active_filters` are never stored** — always computed via `buildSolverInput()` in `compute.ts`
- **One-way data flow:** `DesignState` → `buildSolverInput()` → `SystemInput` → WASM solver → results → plots
- **Undo/redo:** `useUndoRedo<DesignState>` hook wraps the entire state
- **URL sync:** `useUrlSync` encodes `DesignState` to URL hash (`#v2=...`)
- **Save/load:** `SaveLoad.tsx` serializes `DesignState` directly to `ls-designs-v2` localStorage key (auto-migrates v1 saves)

## Build Commands
```bash
# Rust solver → WASM (release)
cd solver && wasm-pack build --target web --release

# Rust solver → WASM (dev, faster build)
cd solver && wasm-pack build --target web --dev

# React frontend
cd web && npm run build

# CLI binary
cd solver && cargo build --release --bin loudspeaker-solver

# Development
cd solver && cargo test                    # run solver tests (100+ tests)
cd solver && cargo test -- --nocapture     # with output
cd web && npm run dev                      # Vite dev server (needs WASM built first)
cd web && npx tsc --noEmit                 # TypeScript check only
cd web && npx playwright test              # Playwright E2E tests (needs dev server or auto-starts)

# Deploy (after building both)
scp -i ~/.ssh/id_ed25519 -r web/dist/* deploy@57.129.6.118:/var/www/ls/
```

## Rust Toolchain
- **Toolchain:** `stable-x86_64-pc-windows-gnu` (NOT msvc — no VS linker installed)
- **WASM target:** `wasm32-unknown-unknown` (installed via rustup)
- **fnm** manages Node.js — run `eval "$(fnm env)"` before npm commands in bash

## Solver Modules (16)
| Module | Purpose |
|--------|---------|
| `constants.rs` | Physical constants (Beranek) |
| `types.rs` | DriverParams, EnclosureConfig (7 variants), SimulationInput/Result |
| `driver.rs` | T/S parameter derivation (Small 1972), Ke semi-inductance model |
| `sweep.rs` | Log frequency sweep, SPL conversion, group delay, impulse response |
| `sealed.rs` | Sealed box model with Ql losses |
| `vented.rs` | Vented box model (Helmholtz, port velocity, slot ports) |
| `transfer_matrix.rs` | TMM primitives (full Bradbury complex k and Z) |
| `transmission_line.rs` | TL model (TMM chain, taper, stuffing zones, folds, driver offset) |
| `horn.rs` | Horn model (6 profiles, multi-segment, throat/rear chamber) |
| `bandpass.rs` | 4th-order bandpass (sealed rear + vented front) |
| `passive_radiator.rs` | Sealed + mass-spring passive radiator |
| `open_baffle.rs` | Dipole with baffle step diffraction |
| `crossover.rs` | Passive ABCD ladder (10 block types), active filters (16 types), biquad export, E-series rounding |
| `system.rs` | Multi-way complex acoustic summation with filter transfer function |
| `alignments.rs` | Sealed (BW/Bessel/Cheby) + Vented (B4/QB3/SC4/EBS) presets |
| `optimizer.rs` | Nelder-Mead simplex for crossover auto-tuning |

## Frontend Components
| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root — DesignState single source of truth, accordion sidebar, way tabs |
| `compute.ts` | `buildSolverInput()` — assembles active_filters from crossover points + EQ |
| `WayEditor.tsx` | Per-way: preset selector, driver inputs, FRD/ZMA import |
| `CrossoverPanel.tsx` | Crossover points editor, per-way controls, EQ, passive wizard |
| `PassiveWizard.tsx` | Passive crossover topology presets (1st-4th order, Zobel, L-pad, notch) |
| `SystemPanel.tsx` | Freq range, optimizer, save/load, export, compare, undo/redo |
| `SaveLoad.tsx` | localStorage persistence + JSON import/export (v2 format, migrates v1) |
| `FrequencyPlot.tsx` | ECharts log-axis chart with dual Y-axis, cross-chart linking |
| `PlotArea.tsx` | SPL + impedance + displacement + port velocity + group delay + phase |
| `SystemPlotArea.tsx` | System SPL + filter transfer + impedance + group delay, min-Z warning |
| `DriverInputs.tsx` | T/S parameter inputs with derived readouts (Qts, Bl, sensitivity) |
| `EnclosureInputs.tsx` | 7 enclosure types, alignment presets, computed readouts |
| `PresetSelector.tsx` | 571-driver searchable database |
| `NumericInput.tsx` | Number input with local draft state (no mid-type fighting) |
| `CrossoverSchematic.tsx` | SVG circuit diagram for passive crossover |
| `EnclosureSchematic.tsx` | SVG cross-section for all enclosure types |
| `SchematicPanel.tsx` | Collapsible bottom panel for schematics |
| `OptimizerPanel.tsx` | Nelder-Mead optimizer UI with target SPL |
| `BiquadExport.tsx` | miniDSP-compatible DSP coefficient export |
| `ImportOverlay.tsx` | FRD/ZMA file import + plot overlay |
| `ExportControls.tsx` | FRD/ZMA/CSV export with real acoustic phase |

## IP Rules
- Clean-room Rust implementation
- Can study Hornresp VB6 and os-lem Python to learn algorithms
- Implement from published acoustic theory (Thiele, Small, Beranek, Bailey, etc.)
- Every equation must have a comment citing its source
- No verbatim code copied from any source
- Use Hornresp v60 + XSim4 as behavioral test oracles

## Key Design Decisions
- Rust/WASM for solver performance and IP separation
- All computation client-side (no server)
- ECharts 6 for plots (log axes, dual Y-axis, cross-chart tooltip linking)
- Graf Design System (GDS) v4.2 for styling — CSS-only, use `graf-*` classes
- Transfer Matrix Method for transmission lines and horns
- ABCD matrix cascade for passive crossover networks
- Nelder-Mead simplex for crossover optimization
- JSON `#[serde(tag = "type")]` for enum serialization
- URL hash state encoding for shareable design links

## Testing
- `cargo test` in solver/ — 100+ tests across 16 test files
- Cross-validated against QSpeakers C++ solver (vented port phase fix verified)
- Analytical validation tests (sealed Fc/Qtc, vented dual peaks, port velocity)
- Alignment presets verified against simulation output
- Optimizer tests: cost reduction from 229→3 in 41 iterations
- FRD/ZMA tests: measured data bypass, passive filters with FRD, 2-way measured crossover
- Playwright E2E tests: `cd web && npx playwright test` — 20 tests covering driver params, enclosure, passive/active crossover, per-way controls, system controls, and FRD mode
- All systems (including 1-way) route through `solve_system` — `solve_simulation` is only called internally

## Design Docs
- Design: `docs/plans/2026-04-05-loudspeaker-sim-design.md`
- Plan: `docs/plans/2026-04-05-loudspeaker-sim-v01-plan.md`
- Revised roadmap: `docs/plans/2026-04-06-revised-roadmap.md`
- Gap-closing plan: `docs/plans/2026-04-06-gap-closing-plan.md`
- UI rewrite v2 design: `docs/plans/2026-04-08-ui-rewrite-v2.md`
- UI rewrite v2 plan: `docs/plans/2026-04-08-ui-rewrite-v2-plan.md`
- Feature audits: `docs/feature-audit-hornresp-xsim.md`, `docs/qspeakers-comparison.md`
- LLM variable inventory: `docs/LLM-VARIABLE-INVENTORY.md`
- References: `docs/REFERENCES.md`

## Deployment
- **Domain:** ls.graf.me.uk
- **Server:** OVH VPS (57.129.6.118), Nginx, Cloudflare proxy
- **Config:** `/etc/nginx/sites-available/ls.graf.me.uk`
- **Web root:** `/var/www/ls/`
- **SSH:** `ssh -i ~/.ssh/id_ed25519 deploy@57.129.6.118`
