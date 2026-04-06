# Loudspeaker Simulator

Browser-based loudspeaker enclosure simulator with sealed, vented, and transmission line models. Runs entirely client-side — no server, no accounts, no install.

**Live:** [ls.graf.me.uk](https://ls.graf.me.uk)

## Features

- **Three enclosure types:** Sealed (closed box), Vented (bass reflex), Transmission Line (quarter-wave)
- **Real-time plots:** SPL, impedance, cone displacement, port velocity — update instantly as you change parameters
- **Driver presets:** 5 built-in generic drivers (6.5" woofer to 12" PA)
- **Save/Load:** localStorage persistence + JSON import/export
- **Standard file export:** FRD (SPL), ZMA (impedance), CSV (all data) — compatible with Hornresp, XSim, VituixCAD, REW

## Architecture

```
┌────────────────────────────────────────────┐
│                  Browser                    │
│                                            │
│  ┌──────────────┐   ┌──────────────────┐  │
│  │  React 19    │──▶│  Rust/WASM       │  │
│  │  + ECharts   │◀──│  Solver (140KB)  │  │
│  │  + GDS       │   │                  │  │
│  └──────────────┘   └──────────────────┘  │
│                                            │
│  Static files served from ls.graf.me.uk    │
└────────────────────────────────────────────┘
```

- **Solver:** Rust crate compiled to WebAssembly via wasm-pack. All acoustic simulation math — T/S parameter derivation, electromechanical circuit models, transfer matrix method.
- **Frontend:** React 19 + Vite + TypeScript. Apache ECharts for log-axis frequency response plots. Graf Design System for UI styling.
- **API:** Single WASM entry point: `simulate(json_string) → json_string`. ~50ms per 500-point sweep.

## Development

### Prerequisites

- Rust toolchain (`rustup`) with `wasm32-unknown-unknown` target
- `wasm-pack`
- Node.js 22+ (via fnm)

### Build

```bash
# Build WASM solver
cd solver && wasm-pack build --target web --release

# Install frontend deps + build
cd web && npm install && npm run build

# Run tests (45 tests)
cd solver && cargo test
```

### Dev Server

```bash
# Build WASM first (dev mode for speed)
cd solver && wasm-pack build --target web --dev

# Start Vite dev server
cd web && npm run dev
```

## Academic References

All equations are cited in the source code. Key references:

- Small, R.H. — "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972)
- Small, R.H. — "Closed-Box Loudspeaker Systems" (JAES, 1972)
- Small, R.H. — "Vented-Box Loudspeaker Systems" (JAES, 1973)
- Beranek, L.L. — "Acoustics" (1954, revised 1986)
- Bradbury, L.J.S. — "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES, 1976)
- Leach, W.M. — "Electroacoustics and Audio Amplifier Design"

Full list in [`docs/REFERENCES.md`](docs/REFERENCES.md).

## License

Proprietary. Clean-room implementation — no code copied from Hornresp, XSim, or any other source.

---

Built by [Graf y Asociados](https://alfredograf.com)
