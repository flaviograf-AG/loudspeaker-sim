# CLAUDE.md — Loudspeaker Simulator

## Project Overview
Browser-based loudspeaker enclosure + crossover simulator. Combines Hornresp (enclosure modeling) and XSim (crossover design) functionality in a single web app. Live at **https://ls.graf.me.uk**.

## Architecture
- `solver/` — Rust crate compiled to WASM (wasm-pack). All acoustic simulation math lives here. 8 modules, 45 tests.
- `web/` — React 19 + Vite + TypeScript frontend. ECharts for plots, GDS for styling.
- Static deploy to ls.graf.me.uk (OVH VPS, Nginx, Cloudflare proxy). Zero server dependencies.
- WASM API: single `simulate(json_string) → json_string` entry point.

## Build Commands
```bash
# Rust solver → WASM (release)
cd solver && wasm-pack build --target web --release

# Rust solver → WASM (dev, faster build)
cd solver && wasm-pack build --target web --dev

# React frontend
cd web && npm run build

# Development
cd solver && cargo test                    # run solver tests (45 tests)
cd solver && cargo test -- --nocapture     # with output
cd web && npm run dev                      # Vite dev server (needs WASM built first)
cd web && npx tsc --noEmit                 # TypeScript check only

# Deploy (after building both)
scp -i ~/.ssh/id_ed25519 -r web/dist/* deploy@57.129.6.118:/var/www/ls/
```

## Rust Toolchain
- **Toolchain:** `stable-x86_64-pc-windows-gnu` (NOT msvc — no VS linker installed)
- **WASM target:** `wasm32-unknown-unknown` (installed via rustup)
- **fnm** manages Node.js — run `eval "$(fnm env)"` before npm commands in bash

## Solver Modules
| Module | Purpose |
|--------|---------|
| `constants.rs` | Physical constants (Beranek) |
| `types.rs` | DriverParams, EnclosureConfig, SimulationInput/Result |
| `driver.rs` | T/S parameter derivation (Small 1972) |
| `sweep.rs` | Log frequency sweep, SPL conversion |
| `sealed.rs` | Sealed box model (2nd-order HP) |
| `vented.rs` | Vented box model (Helmholtz resonator, 4th-order) |
| `transfer_matrix.rs` | TMM primitives (duct segments, cascade) |
| `transmission_line.rs` | TL model (TMM chain, taper, stuffing) |

## Frontend Components
| Component | Purpose |
|-----------|---------|
| `FrequencyPlot.tsx` | ECharts log-axis frequency response plot |
| `PlotArea.tsx` | Composes SPL + impedance + displacement + port velocity plots |
| `DriverInputs.tsx` | T/S parameter inputs with user-friendly units |
| `EnclosureInputs.tsx` | Sealed/Vented/TL selector + per-type inputs |
| `PresetSelector.tsx` | 5 built-in driver presets |
| `SaveLoadControls.tsx` | localStorage persistence + JSON import/export |
| `ExportControls.tsx` | FRD/ZMA/CSV file export |
| `useSolver.ts` | Debounced solver hook (50ms) |

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
- ECharts 6 for plots (chosen over uPlot/Plotly for: log axes, dual Y-axis, polar plots, heatmaps, cross-chart tooltip linking)
- Graf Design System (GDS) v4.2 for styling — CSS-only, use `graf-*` classes
- Logarithmic frequency sweep, 500 points 10Hz–20kHz
- Transfer Matrix Method for transmission lines
- Modified Nodal Analysis for crossover networks (v0.2+)
- JSON `#[serde(tag = "type")]` for EnclosureConfig enum serialization

## Testing
- `cargo test` in solver/ — 45 tests across 9 test files
- Oracle tests planned: compare output against Hornresp v60 reference data
- Every formula has a test proving it matches published values or physical expectations

## Design Docs
- Design: `docs/plans/2026-04-05-loudspeaker-sim-design.md`
- Plan: `docs/plans/2026-04-05-loudspeaker-sim-v01-plan.md`
- References: `docs/REFERENCES.md`

## Deployment
- **Domain:** ls.graf.me.uk
- **Server:** OVH VPS (57.129.6.118), Nginx, Cloudflare proxy
- **Config:** `/etc/nginx/sites-available/ls.graf.me.uk`
- **Web root:** `/var/www/ls/`
- **SSH:** `ssh -i ~/.ssh/id_ed25519 deploy@57.129.6.118`
