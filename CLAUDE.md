# CLAUDE.md — Loudspeaker Simulator

## Project Overview
Browser-based loudspeaker enclosure + crossover simulator. Combines Hornresp (enclosure modeling) and XSim (crossover design) functionality in a single web app.

## Architecture
- `solver/` — Rust crate compiled to WASM. All acoustic simulation math lives here.
- `web/` — React 19 + Vite + TypeScript frontend. GDS for styling.
- Static deploy to ls.graf.me.uk. Zero server dependencies.

## Build Commands
```bash
# Rust solver → WASM
cd solver && wasm-pack build --target web --release

# React frontend
cd web && npm run build

# Development
cd solver && cargo test                    # run solver tests
cd solver && cargo test -- --nocapture     # with output
cd web && npm run dev                      # Vite dev server
```

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
- Logarithmic frequency sweep, typically 500 points 10Hz–20kHz
- Transfer Matrix Method for transmission lines
- Modified Nodal Analysis for crossover networks (v0.2+)

## Testing
- `cargo test` in solver/ for unit + integration tests
- Oracle tests compare output against Hornresp v60 reference data in solver/tests/validation/
- Every formula has a test proving it matches published values

## Design Docs
- Design: `docs/plans/2026-04-05-loudspeaker-sim-design.md`
- Plan: `docs/plans/2026-04-05-loudspeaker-sim-v01-plan.md`
- References: `docs/REFERENCES.md`
